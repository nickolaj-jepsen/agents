/**
 * The mod over the core, whose queue logic has its own tests (`core/docfix.spec.ts`):
 * here the tool's file IO, the status count, and the pane's apply.
 */
import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

const ROOT = "/repo";
const DIR = `${ROOT}/.agents/store/docfix`;

const PANE = {
  plugin: "docfix",
  component: "Pane",
  requestId: "docfix",
  props: {
    title: "Doc suggestions",
    isFocused: true,
    bodyColumns: 80,
    placement: "dock",
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const;

/** An engine with a repo at ROOT tracking AGENTS.md, its files in a Map. */
function engine(on: On) {
  const files = new Map<string, string>();
  const statuses: (string | undefined)[] = [];
  const fills: { text: string; mode?: string }[] = [];
  const toasts: string[] = [];
  const draft = { text: "" };
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("tool.register", (_$, e) => ({ value: { tool: `mcp__docfix__${e.name}` } }));
  on("command.register", (_$, e) => ({ value: { command: e.name } }));
  on("session.cwd", () => ({ value: ROOT }));
  on("session.id", () => ({ value: "s1" }));
  on("clock.now", () => ({ value: Date.parse("2026-11-15T10:00:00Z") }));
  on("fs.exists", (_$, e) => ({ value: e.path === `${ROOT}/.agents/store` || files.has(e.path) }));
  on("fs.list", (_$, e) => ({
    value: [...files.keys()]
      .filter((path) => path.startsWith(`${e.path}/`))
      .map((path) => ({
        name: path.slice(e.path.length + 1),
        kind: "file",
        size: 0,
        mtimeMs: 0,
        isLink: false,
      })),
  }));
  on("fs.read", (_$, e) => ({ value: files.get(e.path) ?? "" }));
  on("fs.write", (_$, e) => {
    files.set(e.path, e.text);
    return { value: undefined };
  });
  on("process.run", (_$, e) => {
    const [cmd, ...args] = e.argv;
    if (cmd === "git" && args[0] === "rev-parse")
      return {
        value: {
          exitCode: 0,
          stdout: `${ROOT}\n`,
          stderr: "",
          isStdoutTruncated: false,
          isStderrTruncated: false,
        },
      };
    if (cmd === "git" && args[0] === "ls-files")
      return {
        value: {
          exitCode: args.at(-1) === "AGENTS.md" ? 0 : 1,
          stdout: "",
          stderr: "",
          isStdoutTruncated: false,
          isStderrTruncated: false,
        },
      };
    if (cmd === "rm") files.delete(args.at(-1) ?? "");
    return {
      value: {
        exitCode: 0,
        stdout: "",
        stderr: "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });
  on("ui.status", (_$, e) => {
    statuses.push(e.text);
    return { value: undefined };
  });
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("ui.close", () => ({ value: undefined }));
  on("ui.focus", () => ({}));
  on("ui.toast", (_$, e) => {
    toasts.push(e.text);
    return { value: undefined };
  });
  on("prompt.read", () => ({ value: { text: draft.text, cursor: draft.text.length } }));
  on("prompt.fill", (_$, e) => {
    fills.push({ text: e.text, mode: e.mode });
    return { isFilled: true };
  });
  return { files, statuses, fills, toasts, draft };
}

const SUGGEST = {
  tool: "mcp__docfix__docfix" as const,
  action: "suggest",
  file: "AGENTS.md",
  kind: "missing",
  claim: "Run pnpm install --force after a sjusk bump",
  evidence: "AGENTS.md:12 says pnpm install; the shim stayed stale",
};

test("a suggestion lands in the store and counts on the status line", async ($, on) => {
  const world = engine(on);
  await $.session.start({ cwd: ROOT, surface: "terminal", isInteractive: true });

  const filed = await $.tool.call(SUGGEST);
  expect(String(filed.result)).toContain("Filed agents--run-pnpm-install-force-after-a-sjusk-bump");
  expect([...world.files.keys()]).toEqual([
    `${DIR}/agents--run-pnpm-install-force-after-a-sjusk-bump.md`,
  ]);
  expect(world.statuses.at(-1)).toBe("docs 1");

  const untracked = await $.tool.call({ ...SUGGEST, file: "docs/nope.md" });
  expect(untracked.deny ?? untracked.text).toContain("not a file git tracks");
});

test("apply drafts one prompt of references in the prompt box and sends nothing", async ($, on) => {
  const world = engine(on);
  await $.session.start({ cwd: ROOT, surface: "terminal", isInteractive: true });
  await $.tool.call(SUGGEST);
  await $.tool.call({ ...SUGGEST, file: "AGENTS.md", claim: "A second gap", same_as: "none" });
  await $.command.run({
    command: "docfix",
    args: "",
    origin: { kind: "composer" },
    presentation: { isFullscreen: true, columns: 160 },
  });

  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  await ui.press({ key: "row:agents--run-pnpm-install-force-after-a-sjusk-bump" });
  await ui.press({ key: "apply" });
  expect(world.fills).toHaveLength(1);
  const [fill] = world.fills;
  expect(fill?.mode).toBe("replace");
  expect(fill?.text).toContain("Apply these docfix suggestions");
  // The one marked suggestion is named by its file; its evidence stays there.
  expect(fill?.text).toContain(
    ".agents/store/docfix/agents--run-pnpm-install-force-after-a-sjusk-bump.md",
  );
  expect(fill?.text).not.toContain("the shim stayed stale");
  expect(fill?.text).not.toContain("A second gap");
  expect(world.toasts.join()).toContain("prompt box");
  await ui.unmount();

  await $.tool.call({
    tool: "mcp__docfix__docfix" as const,
    action: "resolve",
    id: "agents--run-pnpm-install-force-after-a-sjusk-bump",
  });
  expect(world.files.size).toBe(1);
});

test("apply appends to a draft the person already typed", async ($, on) => {
  const world = engine(on);
  world.draft.text = "also, while you are there";
  await $.session.start({ cwd: ROOT, surface: "terminal", isInteractive: true });
  await $.tool.call(SUGGEST);
  await $.command.run({
    command: "docfix",
    args: "",
    origin: { kind: "composer" },
    presentation: { isFullscreen: true, columns: 160 },
  });
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  await ui.press({ key: "apply" });
  expect(world.fills).toHaveLength(0);
  await ui.press({ key: "row:agents--run-pnpm-install-force-after-a-sjusk-bump" });
  await ui.press({ key: "apply" });
  expect(world.fills[0]?.mode).toBe("append");
  expect(world.fills[0]?.text.startsWith("\n\n")).toBe(true);
  await ui.unmount();
});

test("the pane shows a long claim and all its evidence whole", async ($, on) => {
  engine(on);
  await $.session.start({ cwd: ROOT, surface: "terminal", isInteractive: true });
  const claim = `${"A claim that runs well past one line of the pane and must not be cut. ".repeat(4)}END-OF-CLAIM`;
  const evidence = `${"x ".repeat(300)}END-OF-EVIDENCE`;
  await $.tool.call({ ...SUGGEST, claim: claim.slice(0, 270) + " END-OF-CLAIM", evidence });
  await $.command.run({
    command: "docfix",
    args: "",
    origin: { kind: "composer" },
    presentation: { isFullscreen: true, columns: 160 },
  });
  const ui = await $.ui.mount({
    ...PANE,
    props: { ...PANE.props, bodyColumns: 48 },
    surface: "terminal",
  });
  // A pane this thin starts with its evidence folded: the key shows it.
  expect(await ui.find({ type: "Text", text: /END-OF-EVIDENCE/ })).toBeUndefined();
  await ui.press({ key: "evidence" });
  const row = await ui.find({ type: "Button", text: /END-OF-CLAIM/ });
  expect(row).toBeDefined();
  expect(await ui.find({ type: "Button", text: /…/ })).toBeUndefined();
  expect(await ui.find({ type: "Text", text: /END-OF-EVIDENCE/ })).toBeDefined();
  await ui.unmount();
});

test("a dismiss can be undone", async ($, on) => {
  const world = engine(on);
  await $.session.start({ cwd: ROOT, surface: "terminal", isInteractive: true });
  await $.tool.call(SUGGEST);
  await $.command.run({
    command: "docfix",
    args: "",
    origin: { kind: "composer" },
    presentation: { isFullscreen: true, columns: 160 },
  });
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  await ui.press({ key: "row:agents--run-pnpm-install-force-after-a-sjusk-bump" });
  await ui.press({ key: "dismiss" });
  expect(world.statuses.at(-1)).toBeUndefined();
  expect(await ui.find({ type: "Text", text: /Dismissed 1/ })).toBeDefined();
  await ui.press({ key: "undo" });
  expect(world.statuses.at(-1)).toBe("docs 1");
  await ui.unmount();
});
