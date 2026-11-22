/**
 * The mod over the core, whose queue logic has its own tests (`core/docfix.spec.ts`): here the
 * tool's file IO, the count above the prompt, and the pane: what a row is set to, its folding and its keys.
 * What closing carries out needs a person's close, which only a session has (the scenarios in `src/e2e/`).
 */
import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";
import type { Engine, Mounted } from "claude-code/testing";
import { expectNative } from "@agents/kit-core/paint/checks.tsx";

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
 * Button, `docfix: docs 2`; a graphical surface's is a line in words with its own Button to open
 * the pane.
 */
async function bandCount($: Engine, surface: "terminal" | "desktop" | "vscode" = "terminal") {
  const band = await $.ui.mount({ ...BAND, surface });
  const isTerminal = surface === "terminal";
  const shown = await band.find({
    type: isTerminal ? "Button" : "Text",
    text: isTerminal ? /docfix: docs \d+/ : /^\d+ doc suggestions? to review$/,
  });
  await band.unmount();
  return shown?.text.match(/(\d+)/)?.[1];
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

const SECOND = "agents--a-second-gap";

/** Two suggestions on AGENTS.md, and the terminal pane open on them, tall enough for every zone. */
async function twoOpen($: Engine, on: On) {
  const world = engine(on);
  await $.session.start({ cwd: ROOT, surface: "terminal", isInteractive: true });
  await $.tool.call(SUGGEST);
  await $.tool.call({ ...SUGGEST, claim: "A second gap", same_as: "none" });
  await $.command.run(COMMAND);
  const ui = await $.ui.mount({
    ...PANE,
    props: { ...PANE.props, scroll: { offset: 0, bodyRows: 40 } },
    surface: "terminal",
  });
  return { world, ui };
}

/** Whether a Text shows `text`: a row is runs of Text, a control's its own. */
const shows = async (ui: Pick<Mounted, "find">, text: RegExp) =>
  (await ui.find({ type: "Text", text })) !== undefined;

/** The keyboard's row: its pointer and mark are a control of their own, `mark:<id>`. */
const pointerOn = async (ui: Pick<Mounted, "find">, id: string) =>
  /❯/.test((await ui.find({ type: "Button", key: `mark:${id}` }))?.text ?? "");

test("the terminal pane is the shared screen: the caption, the doc, its rows and the footer", async ($, on) => {
  const { world, ui } = await twoOpen($, on);
  // The pane shows the count itself, so the band above the prompt steps aside.
  expect(await bandCount($)).toBeUndefined();
  expect(await shows(ui, /suggestions ── 2 left/)).toBe(true);
  expect(await pointerOn(ui, ID)).toBe(true);
  expect(await shows(ui, /missing · today/)).toBe(true);
  expect(await shows(ui, /^Evidence$/)).toBe(true);
  // A rule the pane's whole width is over the focused suggestion; the caption's is shorter.
  expect(await shows(ui, /^─{60,}$/)).toBe(true);
  // Every control is a plain Button under its own key; the ring and the hotkeys draw nothing.
  const keys = (await ui.findAll({ type: "Button" })).map((b) => String(b.key));
  for (const key of [
    `row:${ID}`,
    `mark:${ID}`,
    `row:${SECOND}`,
    "doc:AGENTS.md",
    "all:apply:AGENTS.md",
    "all:dismiss:AGENTS.md",
    "detail",
    "evidence",
    "main",
    "apply",
    "dismiss",
    "frame:close",
    "kit-ring",
    "kit-key-a",
    "kit-key-d",
    "kit-key-e",
  ])
    expect(keys).toContain(key);
  expect(world.fills).toHaveLength(0);
  await ui.unmount();
});

test("Apply sets the keyboard's row and moves on; the main action is Draft prompt", async ($, on) => {
  const { world, ui } = await twoOpen($, on);
  await ui.press({ key: "apply" });
  expect(await shows(ui, /● 1 · 1 left/)).toBe(true);
  expect(await pointerOn(ui, SECOND)).toBe(true);
  expect(await shows(ui, /^Draft prompt$/)).toBe(true);
  // The hotkey on the ring's hidden button does what the footer's button does.
  await ui.press({ key: "kit-key-d" });
  expect(await shows(ui, /suggestions ── ● 1 · – 1 ─/)).toBe(true);
  // Setting a row does nothing yet: the main action carries it out.
  expect(world.fills).toHaveLength(0);
  await ui.unmount();
});

test("a click on a mark steps it, and Apply all sets the doc", async ($, on) => {
  const { ui } = await twoOpen($, on);
  await ui.press({ key: `mark:${SECOND}` });
  expect(await pointerOn(ui, SECOND)).toBe(true);
  expect(await shows(ui, /● 1 · 1 left/)).toBe(true);
  await ui.press({ key: `mark:${SECOND}` });
  expect(await shows(ui, /– 1 · 1 left/)).toBe(true);
  await ui.press({ key: "all:apply:AGENTS.md" });
  expect(await shows(ui, /suggestions ── ● 2 ─/)).toBe(true);
  await ui.press({ key: "all:apply:AGENTS.md" });
  expect(await shows(ui, /suggestions ── 2 left/)).toBe(true);
  await ui.unmount();
});

test("the main action dismisses and drafts the prompt, and closes", async ($, on) => {
  const { world, ui } = await twoOpen($, on);
  await ui.press({ key: "apply" });
  await ui.press({ key: "dismiss" });
  await ui.press({ key: "kit-ring" });
  expect(world.fills).toHaveLength(1);
  expect(world.fills[0]?.text).toContain("Run pnpm install --force");
  expect(world.fills[0]?.text).not.toContain("A second gap");
  expect(world.files.get(`${DIR}/${SECOND}.md`)).toContain("status: dismissed");
  expect(world.toasts.join(" ")).toContain("Dismissed 1.");
  await ui.unmount();
});

test("Close asks before it throws the choices away; Keep keeps them, Discard drafts nothing", async ($, on) => {
  const { world, ui } = await twoOpen($, on);
  await ui.press({ key: "apply" });
  await ui.press({ key: "frame:close" });
  expect(await shows(ui, /Discard 1\?/)).toBe(true);
  // The footer is dim and inert while the question is up.
  expect(await ui.find({ type: "Button", key: "main" })).toBeUndefined();
  await ui.press({ key: "frame:keep" });
  expect(await shows(ui, /● 1 · 1 left/)).toBe(true);
  await ui.press({ key: "frame:close" });
  await ui.press({ key: "frame:discard" });
  expect(world.fills).toHaveLength(0);
  expect(world.files.get(`${DIR}/${ID}.md`)).toContain("status: open");
  await ui.unmount();
});

test("the ring's moves are the screen's: an arrow moves the keyboard, a click puts it on a row", async ($, on) => {
  const { ui } = await twoOpen($, on);
  const move = (element: string) =>
    $.ui.focus({ component: "Pane", requestId: "docfix", element, origin: { kind: "person" } });
  await move("kit-ring-down");
  expect(await pointerOn(ui, SECOND)).toBe(true);
  await move(`row:${ID}`);
  expect(await pointerOn(ui, ID)).toBe(true);
  // A click on a footer button moves nothing: its press acts on the keyboard's row.
  await move("apply");
  expect(await pointerOn(ui, ID)).toBe(true);
  await ui.unmount();
});

test("the reader: where it is and Back on its first row; Apply stays on its suggestion", async ($, on) => {
  const { ui } = await twoOpen($, on);
  await ui.press({ key: "kit-key-e" });
  expect(await shows(ui, /○ AGENTS\.md · missing · today/)).toBe(true);
  expect(await shows(ui, /AGENTS\.md:12 says pnpm install/)).toBe(true);
  expect(await ui.find({ type: "Button", key: "back" })).toBeDefined();
  await ui.press({ key: "apply" });
  expect(await shows(ui, /● AGENTS\.md · missing/)).toBe(true);
  await ui.press({ key: "back" });
  expect(await ui.find({ type: "Button", key: "back" })).toBeUndefined();
  await ui.press({ key: "evidence" });
  expect(await ui.find({ type: "Button", key: "back" })).toBeDefined();
  await ui.unmount();
});

test("in a pane of six rows the rows carry their doc, and the queue is all there is", async ($, on) => {
  engine(on);
  await $.session.start({ cwd: ROOT, surface: "terminal", isInteractive: true });
  await $.tool.call(SUGGEST);
  await $.command.run(COMMAND);
  const ui = await $.ui.mount({
    ...PANE,
    props: { ...PANE.props, placement: "inline", scroll: { offset: 0, bodyRows: 6 } },
    surface: "terminal",
  });
  expect(await shows(ui, /AGENTS\.md › Run pnpm install/)).toBe(true);
  // No focused suggestion under the queue, so no rule over one.
  expect(await shows(ui, /^─{60,}$/)).toBe(false);
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
    // A row is its mark, its claim whole, its kind and a quiet button that opens it.
    // Folded, a row is one line the surface cuts at its edge.
    expect((await ui.find({ type: "Text", text: /sjusk/ }))?.props.wrap).toBe("truncate-end");
    expect(await ui.find({ type: "Text", text: /A second gap/ })).toBeDefined();
    expect(await ui.find({ type: "Text", text: /^missing$/ })).toBeDefined();
    expect(await ui.find({ type: "Svg" })).toBeDefined();
    const open = await ui.find({ type: "Button", key: `row:${ID}` });
    expect(open?.text).toBe("Open");
    expect(open?.props.dimColor).toBe(true);
    // A doc's heading is its path alone.
    expect(await ui.find({ type: "Button", text: /all$/i })).toBeUndefined();
    // Its choices wait inside the row; Submit, at the top, is quiet while nothing is set.
    expect(await ui.find({ type: "Button", key: `apply:${ID}` })).toBeUndefined();
    const submit = async () => (await ui.find({ type: "Button", key: "submit" }))?.props;
    expect((await submit())?.dimColor).toBe(true);
    expect(await ui.find({ type: "Text", text: /^2 open$/ })).toBeDefined();
    await expectNative(ui);

    // Opened, the row has its history, its evidence and its choices, all quiet.
    await ui.press({ key: `row:${ID}` });
    // The opened row shows its claim whole.
    expect((await ui.find({ type: "Text", text: /sjusk/ }))?.props.wrap).toBeUndefined();
    expect((await ui.find({ type: "Button", key: `row:${ID}` }))?.text).toBe("Close");
    expect(await ui.find({ type: "Text", text: /^today$/ })).toBeDefined();
    expect(await ui.find({ type: "Text", text: /^Evidence$/ })).toBeDefined();
    expect(await ui.find({ text: /AGENTS\.md:12 says pnpm install/ })).toBeDefined();
    for (const choice of ["apply", "dismiss", "skip"]) {
      const button = await ui.find({ type: "Button", key: `${choice}:${ID}` });
      expect(button?.text).toBe(choice[0]?.toUpperCase() + choice.slice(1));
      expect(button?.props.dimColor).toBe(true);
    }
    await expectNative(ui);
    await ui.press({ key: `apply:${ID}` });
    expect(await ui.find({ type: "Text", text: /On close: apply 1/ })).toBeDefined();
    expect((await submit())?.variant).toBe("primary");
    expect((await submit())?.dimColor).toBeUndefined();
    // The only filled button is Submit: what a row is set to shows on its mark.
    expect(
      (await ui.findAll({ type: "Button" })).filter((b) => b.props.variant === "primary"),
    ).toHaveLength(1);
    // Pressed again, the row is skipped; setting a row does nothing until the pane closes.
    await ui.press({ key: `apply:${ID}` });
    expect(await ui.find({ type: "Text", text: /^2 open$/ })).toBeDefined();
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
    // The surface cuts a folded claim: the mod cuts nothing, and shows no evidence until a row opens.
    expect((await ui.find({ type: "Text", text: /END-OF-CLAIM/ }))?.props.wrap).toBe(
      "truncate-end",
    );
    expect(await ui.find({ text: /END-OF-EVIDENCE/ })).toBeUndefined();
    const toggle = String((await ui.find({ type: "Button", text: /Open/ }))?.key);
    expect(toggle).toMatch(/^row:/);
    await ui.press({ key: toggle });
    expect(await ui.find({ text: /END-OF-EVIDENCE/ })).toBeDefined();
    await expectNative(ui);
    await ui.press({ key: toggle });
    expect(await ui.find({ text: /END-OF-EVIDENCE/ })).toBeUndefined();
    await ui.unmount();
  });

  test(`${surface}: opening a row folds the one that was open`, async ($, on) => {
    engine(on);
    await $.session.start({ cwd: ROOT, surface, isInteractive: true });
    await $.tool.call(SUGGEST);
    await $.tool.call({ ...SUGGEST, claim: "A second gap", same_as: "none" });
    await $.command.run(COMMAND);
    const ui = await $.ui.mount({ ...PANE, surface });
    const [one, two] = (await ui.findAll({ type: "Button", text: /^Open$/ })).map((b) =>
      String(b.key),
    );
    await ui.press({ key: String(one) });
    expect(await ui.findAll({ type: "Button", text: /^Close$/ })).toHaveLength(1);
    await ui.press({ key: String(two) });
    const open = await ui.findAll({ type: "Button", text: /^Close$/ });
    expect(open.map((b) => b.key)).toEqual([two]);
    await ui.unmount();
  });

  test(`${surface}: a long queue shows its first suggestions and a button for the rest`, async ($, on) => {
    engine(on);
    await $.session.start({ cwd: ROOT, surface, isInteractive: true });
    for (let i = 0; i < 20; i++)
      await $.tool.call({ ...SUGGEST, claim: `Claim number ${i} of many`, same_as: "none" });
    await $.command.run(COMMAND);
    const ui = await $.ui.mount({ ...PANE, surface });
    const rows = async () => (await ui.findAll({ type: "Button", text: /^Open$/ })).length;
    expect(await rows()).toBe(12);
    const more = await ui.find({ type: "Button", text: /more$/ });
    expect(more?.text).toBe("8 more");
    await ui.press({ key: String(more?.key) });
    expect(await rows()).toBe(20);
    expect(await ui.find({ type: "Button", text: /more$/ })).toBeUndefined();
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
