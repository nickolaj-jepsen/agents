/**
 * The mod over the core, whose queue logic has its own tests (`core/docfix.spec.ts`): here the
 * tool's file IO, the count above the prompt, and the pane: what a row is set to, its folding and its keys.
 * What closing carries out needs a person's close, which only a session has (e2e/docfix).
 */
import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";
import type { Engine, Mounted } from "claude-code/testing";

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
  return { files, fills, toasts, draft };
}

const SUGGEST = {
  tool: "mcp__docfix__docfix" as const,
  action: "suggest",
  file: "AGENTS.md",
  kind: "missing",
  claim: "Run pnpm install --force after a sjusk bump",
  evidence: "AGENTS.md:12 says pnpm install; the shim stayed stale",
};

const BAND = {
  plugin: "docfix",
  component: "AbovePrompt",
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const;

/**
 * The count the band above the prompt shows, or undefined when it draws none. The terminal's is one
 * Button; a graphical surface's is a line of text with its own Button to open the pane.
 */
async function bandCount($: Engine, surface: "terminal" | "desktop" | "vscode" = "terminal") {
  const band = await $.ui.mount({ ...BAND, surface });
  const shown = await band.find({
    type: surface === "terminal" ? "Button" : "Text",
    text: /docfix: docs \d+/,
  });
  await band.unmount();
  return shown?.text.match(/docs (\d+)/)?.[1];
}

test("a suggestion lands in the store and counts above the prompt", async ($, on) => {
  const world = engine(on);
  await $.session.start({ cwd: ROOT, surface: "terminal", isInteractive: true });

  const filed = await $.tool.call(SUGGEST);
  expect(String(filed.result)).toContain("Filed agents--run-pnpm-install-force-after-a-sjusk-bump");
  expect([...world.files.keys()]).toEqual([
    `${DIR}/agents--run-pnpm-install-force-after-a-sjusk-bump.md`,
  ]);
  expect(await bandCount($)).toBe("1");

  const untracked = await $.tool.call({ ...SUGGEST, file: "docs/nope.md" });
  expect(untracked.deny ?? untracked.text).toContain("not a file git tracks");
});

const ID = "agents--run-pnpm-install-force-after-a-sjusk-bump";

const COMMAND = {
  command: "docfix",
  args: "",
  origin: { kind: "composer" },
  presentation: { isFullscreen: true, columns: 160 },
} as const;

test("a row set to apply or dismiss shows on the line under the title; again, it is skipped", async ($, on) => {
  const world = engine(on);
  await $.session.start({ cwd: ROOT, surface: "terminal", isInteractive: true });
  await $.tool.call(SUGGEST);
  await $.tool.call({ ...SUGGEST, file: "AGENTS.md", claim: "A second gap", same_as: "none" });
  expect(await bandCount($)).toBe("2");
  await $.command.run(COMMAND);
  // The pane shows the count itself, so the band above the prompt steps aside.
  expect(await bandCount($)).toBeUndefined();

  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: /carry out apply and dismiss/ })).toBeDefined();
  await ui.press({ key: `apply:row:${ID}` });
  expect(await ui.find({ type: "Text", text: /On close: apply 1/ })).toBeDefined();
  await ui.press({ key: `dismiss:row:${ID}` });
  expect(await ui.find({ type: "Text", text: /On close: dismiss 1/ })).toBeDefined();
  await ui.press({ key: `dismiss:row:${ID}` });
  expect(await ui.find({ type: "Text", text: /carry out apply and dismiss/ })).toBeDefined();
  // Setting a row does nothing yet: closing the pane carries it out (the e2e scenarios).
  expect(world.fills).toHaveLength(0);
  await ui.unmount();
});

test("skip sets a row back, and the keys are drawn whatever the ring is on", async ($, on) => {
  engine(on);
  await $.session.start({ cwd: ROOT, surface: "terminal", isInteractive: true });
  await $.tool.call(SUGGEST);
  await $.command.run(COMMAND);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  // The engine keeps the ring at its index among the Buttons, so their number never changes.
  const count = (await ui.findAll({ type: "Button" })).length;
  await ui.press({ key: `apply:row:${ID}` });
  await $.ui.focus({
    component: "Pane",
    requestId: "docfix",
    element: "grp:AGENTS.md",
    origin: { kind: "person" },
  });
  expect(await ui.findAll({ type: "Button" })).toHaveLength(count);
  await ui.press({ key: `skip:row:${ID}` });
  expect(await ui.find({ type: "Text", text: /carry out apply and dismiss/ })).toBeDefined();
  await ui.unmount();
});

test("a folded row cuts a long claim; opening it shows the claim and its evidence whole", async ($, on) => {
  engine(on);
  await $.session.start({ cwd: ROOT, surface: "terminal", isInteractive: true });
  const claim = "A claim that runs well past one line of the pane and must not be cut. ".repeat(4);
  const evidence = `${"x ".repeat(300)}END-OF-EVIDENCE`;
  await $.tool.call({ ...SUGGEST, claim: claim.slice(0, 270) + " END-OF-CLAIM", evidence });
  await $.command.run(COMMAND);
  const ui = await $.ui.mount({
    ...PANE,
    props: { ...PANE.props, bodyColumns: 48 },
    surface: "terminal",
  });
  expect(await ui.find({ type: "Text", text: /END-OF-EVIDENCE/ })).toBeUndefined();
  expect(await ui.find({ type: "Text", text: /END-OF-CLAIM/ })).toBeUndefined();
  const row = await ui.find({ type: "Button", text: /A claim that runs/ });
  expect(row?.key).toMatch(/^row:/);
  await ui.press({ key: String(row?.key) });
  expect(await ui.find({ type: "Text", text: /END-OF-CLAIM/ })).toBeDefined();
  expect(await ui.find({ type: "Text", text: /END-OF-EVIDENCE/ })).toBeDefined();
  await ui.press({ key: String(row?.key).replace(/^row:/, "ev:") });
  expect(await ui.find({ type: "Text", text: /END-OF-EVIDENCE/ })).toBeUndefined();
  await ui.unmount();
});

test("a doc's header sets every row of the doc", async ($, on) => {
  engine(on);
  await $.session.start({ cwd: ROOT, surface: "terminal", isInteractive: true });
  await $.tool.call(SUGGEST);
  await $.tool.call({ ...SUGGEST, claim: "A second gap", same_as: "none" });
  await $.command.run(COMMAND);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  await ui.press({ key: "dismiss:grp:AGENTS.md" });
  expect(await ui.find({ type: "Text", text: /On close: dismiss 2/ })).toBeDefined();
  await ui.unmount();
});

test("the ring passes over a row's keys, and they follow it", async ($, on) => {
  engine(on);
  await $.session.start({ cwd: ROOT, surface: "terminal", isInteractive: true });
  await $.tool.call(SUGGEST);
  await $.tool.call({ ...SUGGEST, claim: "A second gap", same_as: "none" });
  await $.command.run(COMMAND);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  const [one, two] = (await ui.findAll({ type: "Button", text: /sjusk|second gap/ })).map((r) =>
    String(r.key),
  );
  const move = (element: string) =>
    $.ui.focus({ component: "Pane", requestId: "docfix", element, origin: { kind: "person" } });
  const hotkey = async (key: string) => (await ui.find({ type: "Button", key }))?.props.hotkey;
  await move(String(one));
  expect(await hotkey(`apply:${one}`)).toBe("a");
  // Down onto the first row's evidence line lands the ring on the second row, keys and all.
  await move(`ev:${String(one).replace(/^row:/, "")}`);
  expect(await hotkey(`apply:${one}`)).toBeUndefined();
  expect(await hotkey(`apply:${two}`)).toBe("a");
  // Up onto the first row's keys lands it back on the first row.
  await move(`skip:${one}`);
  expect(await hotkey(`apply:${one}`)).toBe("a");
  await ui.unmount();
});

test("the first read of a tracked doc in a session names the tool after it", async ($, on) => {
  engine(on);
  on("tool.call", { tool: "Read" }, () => ({ result: { type: "text" } as never, text: "body" }));
  on("tool.call", { tool: "Bash" }, () => ({ result: { stdout: "" } as never, text: "body" }));
  await $.session.start({ cwd: ROOT, surface: "terminal", isInteractive: true });

  const first = await $.tool.call({ tool: "Read", file_path: `${ROOT}/AGENTS.md` });
  expect(first.context?.join("\n")).toContain("AGENTS.md");

  const again = await $.tool.call({ tool: "Bash", command: "sed -n 1,20p AGENTS.md" });
  expect(again.context ?? []).toEqual([]);

  const untracked = await $.tool.call({ tool: "Read", file_path: `${ROOT}/docs/nope.md` });
  expect(untracked.context ?? []).toEqual([]);

  const code = await $.tool.call({ tool: "Read", file_path: `${ROOT}/src/a.ts` });
  expect(code.context ?? []).toEqual([]);
});

/** The glyphs a graphical surface draws no controls with. */
const GLYPHS = /[□■☐☑○●✎▸▾❯↑↓╰│]/;

type Tree = Pick<Mounted, "findAll">;

/** What a mounted pane shows, one string per element that shows text. */
async function shown(ui: Tree) {
  return (await ui.findAll({})).map((e) => e.text).filter(Boolean);
}

/**
 * The graphical drawing's rules: its own idioms, none of the terminal's. No rule of repeated
 * characters, no glyph standing in for a control, nothing clamped, no key hints, no hotkey on a
 * button of a row and nothing sized to the viewport.
 */
async function expectNative(ui: Tree) {
  const all = await ui.findAll({});
  for (const text of await shown(ui)) {
    expect(text).not.toMatch(/[─-]{3,}/);
    expect(text).not.toMatch(GLYPHS);
    expect(text).not.toMatch(/…$/m);
    expect(text).not.toMatch(/\b(?:ctrl\+|Enter\b|Esc\b)|\b[a-z]: /);
  }
  for (const e of all) {
    if (e.type === "Button") expect(e.props.hotkey).toBeUndefined();
    if (e.type === "Box") {
      expect(e.props.minHeight).toBeUndefined();
      expect(e.props.width).toBeUndefined();
      expect(e.props.height).toBeUndefined();
    }
    if (e.type === "Text") expect(e.props.wrap).toBeUndefined();
  }
}

// The graphical drawing is the kit's own: the same content on desktop and vscode in the elements
// those surfaces draw (Markdown claims, Svg icons, real Buttons, no cells).
for (const surface of ["desktop", "vscode"] as const) {
  test(`${surface}: the band counts the docs and its button opens the pane`, async ($, on) => {
    engine(on);
    await $.session.start({ cwd: ROOT, surface, isInteractive: true });
    await $.tool.call(SUGGEST);
    await $.tool.call({ ...SUGGEST, claim: "A second gap", same_as: "none" });
    expect(await bandCount($, surface)).toBe("2");
    const band = await $.ui.mount({ ...BAND, surface });
    expect(await band.find({ type: "Svg" })).toBeDefined();
    expect(await band.find({ type: "Button", key: "docfix:open" })).toBeDefined();
    await band.unmount();
    await $.command.run(COMMAND);
    expect(await bandCount($, surface)).toBeUndefined();
  });

  test(`${surface}: the pane shows the doc and its rows, and a press sets a row`, async ($, on) => {
    const world = engine(on);
    await $.session.start({ cwd: ROOT, surface, isInteractive: true });
    await $.tool.call(SUGGEST);
    await $.tool.call({ ...SUGGEST, claim: "A second gap", same_as: "none" });
    await $.command.run(COMMAND);
    const ui = await $.ui.mount({ ...PANE, surface });
    expect(await ui.find({ type: "Text", text: /AGENTS\.md/ })).toBeDefined();
    // A claim is prose: one Markdown each, whole.
    expect(await ui.find({ type: "Markdown", text: /sjusk/ })).toBeDefined();
    expect(await ui.find({ type: "Markdown", text: /A second gap/ })).toBeDefined();
    expect(await ui.find({ type: "Svg" })).toBeDefined();
    for (const key of [
      `apply:row:${ID}`,
      `dismiss:row:${ID}`,
      `skip:row:${ID}`,
      "apply:grp:AGENTS.md",
      "skip:grp:AGENTS.md",
      `ev:${ID}`,
      "submit",
    ])
      expect(await ui.find({ type: "Button", key })).toBeDefined();
    await expectNative(ui);

    await ui.press({ key: `apply:row:${ID}` });
    expect(await ui.find({ type: "Text", text: /On close: apply 1/ })).toBeDefined();
    expect(await ui.find({ type: "Text", text: /Apply on close/ })).toBeDefined();
    await ui.press({ key: `apply:row:${ID}` });
    expect(await ui.find({ type: "Text", text: /carry out apply and dismiss/ })).toBeDefined();
    // A doc's header sets every row of the doc; setting a row does nothing until the pane closes.
    await ui.press({ key: "dismiss:grp:AGENTS.md" });
    expect(await ui.find({ type: "Text", text: /On close: dismiss 2/ })).toBeDefined();
    await ui.press({ key: "skip:grp:AGENTS.md" });
    expect(await ui.find({ type: "Text", text: /carry out apply and dismiss/ })).toBeDefined();
    expect(world.fills).toHaveLength(0);
    await expectNative(ui);
    await ui.unmount();
  });

  test(`${surface}: the claim is whole, and a row opens to its evidence`, async ($, on) => {
    engine(on);
    await $.session.start({ cwd: ROOT, surface, isInteractive: true });
    const claim = "A claim that runs well past one line of the pane and must not be cut. ".repeat(
      4,
    );
    const evidence = `${"x ".repeat(300)}END-OF-EVIDENCE`;
    await $.tool.call({ ...SUGGEST, claim: claim.slice(0, 270) + " END-OF-CLAIM", evidence });
    await $.command.run(COMMAND);
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 48 }, surface });
    // Nothing is folded on a graphical surface: the whole claim shows, the evidence waits.
    expect(await ui.find({ type: "Markdown", text: /END-OF-CLAIM/ })).toBeDefined();
    expect(await ui.find({ text: /END-OF-EVIDENCE/ })).toBeUndefined();
    const toggle = String((await ui.find({ type: "Button", text: /evidence/ }))?.key);
    expect(toggle).toMatch(/^ev:/);
    await ui.press({ key: toggle });
    expect(await ui.find({ type: "Markdown", text: /END-OF-EVIDENCE/ })).toBeDefined();
    await expectNative(ui);
    await ui.press({ key: toggle });
    expect(await ui.find({ text: /END-OF-EVIDENCE/ })).toBeUndefined();
    await ui.unmount();
  });

  test(`${surface}: a long queue shows its first suggestions and a button for the rest`, async ($, on) => {
    engine(on);
    await $.session.start({ cwd: ROOT, surface, isInteractive: true });
    for (let i = 0; i < 20; i++)
      await $.tool.call({ ...SUGGEST, claim: `Claim number ${i} of many`, same_as: "none" });
    await $.command.run(COMMAND);
    const ui = await $.ui.mount({ ...PANE, surface });
    expect(await ui.findAll({ type: "Markdown" })).toHaveLength(12);
    const more = await ui.find({ type: "Button", key: "more" });
    expect(more?.text).toBe("Show 8 more");
    await ui.press({ key: "more" });
    expect(await ui.findAll({ type: "Markdown" })).toHaveLength(20);
    expect(await ui.find({ type: "Button", key: "more" })).toBeUndefined();
    await ui.unmount();
  });

  test(`${surface}: nothing to review says so`, async ($, on) => {
    engine(on);
    await $.session.start({ cwd: ROOT, surface, isInteractive: true });
    await $.command.run(COMMAND);
    const ui = await $.ui.mount({ ...PANE, surface });
    expect(await ui.find({ type: "Text", text: /Nothing to review/ })).toBeDefined();
    await expectNative(ui);
    await ui.unmount();
  });
}
