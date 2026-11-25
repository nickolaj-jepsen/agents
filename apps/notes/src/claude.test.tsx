/**
 * The mod over the lib, whose steps have their own specs (`lib/*.spec.ts`): here the link at a
 * session's start and the line for the agent, /notes in the terminal and on the graphical
 * surfaces (the list, the reader, a hand-off), and the band a turn's notes put above the prompt.
 * What Escape and a click do in a real pane needs a session (the scenarios in `src/e2e/`).
 */
import type { On } from "claude-code";
import { expect, mock, test } from "claude-code/testing";
import type { Engine, Mounted } from "claude-code/testing";
import { expectNative } from "@agents/kit-core/paint/checks.tsx";
import { DETACH } from "@agents/launch/apps.ts";

const ROOT = "/repo";
const STORE = "/data/agents/store/repo-1234abcd";
const MEMORY = "/cfg/projects/-repo/memory";
const HOUR = 3_600_000;
const NOW = Date.parse("2026-11-25T12:00:00Z");

const PANE = {
  plugin: "notes",
  component: "Pane",
  requestId: "notes",
  props: {
    title: "Notes",
    isFocused: true,
    bodyColumns: 80,
    placement: "dock",
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const;

const BAND = {
  plugin: "notes",
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

const COMMAND = {
  command: "notes",
  args: "",
  origin: { kind: "composer" },
  presentation: { isFullscreen: true, columns: 160 },
} as const;

const TURN = {
  turnId: "t1",
  answer: "done",
  reason: "answer",
  durationMs: 10,
  isAborted: false,
} as const;

type File = { text: string; at: number; size?: number };

type World = {
  files: Map<string, File>;
  /** Every argv started through `DETACH`, without it. */
  launched: string[][];
  toasts: string[];
  opened: string[];
  closed: string[];
  /** The events the plugin asked to be drawn again (`$.ui.invalidate`). */
  invalidated: string[];
  /** The folders the link script ran for, in order. */
  ensured: string[];
  /** The folder the session runs in now. */
  cwd: string;
  /** What the link script says: a state, or all of its output; changed by a test. */
  state: string;
  /** What a run of the link script does instead of answering `state`. */
  ensure?: (cwd: string) => ReturnType<typeof ok> | { deny: string };
  clock: ReturnType<typeof mock.clock>;
};

const ok = (stdout: string, exitCode = 0) => ({
  value: { exitCode, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
});

/** What the ensure script prints for a checkout at ROOT in the given state. */
const ensured = (state: string) =>
  state === "not-git"
    ? "state\tnot-git\n"
    : [
        `root\t${ROOT}`,
        `main\t${ROOT}`,
        "id\trepo-1234abcd",
        `store\t${STORE}`,
        ...(state === "adopted" ? ["count\t2"] : []),
        `state\t${state}`,
        "",
      ].join("\n");

const STORE_FILES: Record<string, File> = {
  [`${STORE}/plans/retry-after.md`]: {
    text: "# Retry-After\n\nThe sync worker honours it now.\n",
    at: NOW - HOUR,
  },
  [`${STORE}/plans/hub/PLAN.md`]: { text: "# Hub\n", at: NOW - 30 * HOUR },
  [`${STORE}/plans/hub/diagram.png`]: { text: "png", at: NOW - 30 * HOUR },
  [`${STORE}/reports/eval.html`]: { text: "<h1>Eval</h1>", at: NOW - 3 * HOUR },
  [`${STORE}/screens/a.png`]: { text: "png", at: NOW - 2 * HOUR },
  [`${MEMORY}/MEMORY.md`]: { text: "- shell guard\n", at: NOW - 9 * HOUR },
};

/** A machine with a repository at ROOT whose store holds `files`, Code and a browser installed. */
function world(on: On, { state = "linked", files = STORE_FILES } = {}): World {
  const w: World = {
    files: new Map(Object.entries(files)),
    launched: [],
    toasts: [],
    opened: [],
    closed: [],
    invalidated: [],
    ensured: [],
    cwd: ROOT,
    state,
    clock: mock.clock(on, { now: NOW }),
  };
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("command.register", (_$, e) => ({ value: { command: e.name } }));
  on("ui.log", () => ({ value: undefined }));
  on("session.cwd", () => ({ value: w.cwd }));
  on("vcs.isolate", () => ({ path: "/repo-wt", vcs: "git" }));
  on("ui.invalidate", (_$, e) => {
    w.invalidated.push(e.event);
    return { value: undefined };
  });
  on("env.get", (_$, e) => ({
    value: (
      { HOME: "/home/me", XDG_DATA_HOME: "/data", CLAUDE_CONFIG_DIR: "/cfg" } as Record<
        string,
        string
      >
    )[e.name],
  }));
  // No `autoMemoryDirectory`: memory is the folder named after the main checkout.
  on("settings.read", () => ({ value: {} }));
  on("prompt.context", (_$, e) => ({ blocks: e.blocks }));
  on("prompt.submit", (_$, e) => ({ text: e.text }));
  on("turn.complete", () => ({ text: "" }));
  on("ui.open", (_$, e) => {
    w.opened.push(e.id);
    return { value: { isPlaced: true } };
  });
  on("ui.close", (_$, e) => {
    w.closed.push(e.id);
    return { value: undefined };
  });
  on("ui.focus", () => ({}));
  on("ui.toast", (_$, e) => {
    w.toasts.push(e.text);
    return { value: undefined };
  });
  on("fs.exists", () => ({ value: false }));
  on("fs.stat", (_$, e) => {
    if (e.path === `${ROOT}/.agents/store`)
      return state === "not-git"
        ? { deny: "ENOENT" }
        : { value: { kind: "dir", size: 0, mtimeMs: 0, isLink: true, realPath: STORE } };
    const file = w.files.get(e.path);
    if (!file) return { deny: `ENOENT: ${e.path}` };
    return {
      value: { kind: "file", size: file.size ?? file.text.length, mtimeMs: file.at, isLink: false },
    };
  });
  on("fs.list", (_$, e) => {
    const below = [...w.files.keys()].filter((path) => path.startsWith(`${e.path}/`));
    if (below.length === 0) return { deny: `ENOENT: ${e.path}` };
    const names = new Map<string, "file" | "dir">();
    for (const path of below) {
      const [name, ...rest] = path.slice(e.path.length + 1).split("/");
      names.set(name ?? "", rest.length ? "dir" : "file");
    }
    return {
      value: [...names].map(([name, kind]) => ({
        name,
        kind,
        size: 0,
        mtimeMs: kind === "file" ? (w.files.get(`${e.path}/${name}`)?.at ?? 0) : 0,
        isLink: false,
      })),
    };
  });
  on("fs.read", (_$, e) => {
    const file = w.files.get(e.path);
    return file ? { value: file.text } : { deny: `ENOENT: ${e.path}` };
  });
  on("process.run", (_$, e) => {
    const argv = [...e.argv];
    if (argv[0] === "uname") return ok("Linux\n");
    if (argv[0] === "sh" && argv[2] === DETACH[2]) {
      w.launched.push(argv.slice(DETACH.length));
      return ok("");
    }
    // The probe: `sh -c <script> sh <commands...> -- <paths...>`.
    if (argv[0] === "sh" && argv[2]?.startsWith("mode=c")) {
      const found = ["code", "xdg-open"].filter((name) => argv.includes(name));
      return ok(found.map((name) => `c\t${name}\t/usr/bin/${name}\n`).join(""));
    }
    if (argv[0] === "sh" && argv[2]?.includes("agents-store-id")) {
      w.ensured.push(argv[4] ?? "");
      return w.ensure ? w.ensure(argv[4] ?? "") : ok(ensured(w.state));
    }
    return ok("", 1);
  });
  return w;
}

const start = ($: Engine, surface: "terminal" | "desktop" | "vscode" = "terminal") =>
  $.session.start({ cwd: ROOT, surface, isInteractive: true });

/** Whether a Text shows `text`: a row is runs of Text, a control's its own. */
const shows = async (ui: Pick<Mounted, "find">, text: RegExp) =>
  (await ui.find({ type: "Text", text })) !== undefined;

const RETRY = "row:plans:plans/retry-after.md";
const REPORT = "row:reports:reports/eval.html";

/** /notes in a terminal pane tall enough for every row. */
async function openList($: Engine, surface: "terminal" | "desktop" | "vscode" = "terminal") {
  await start($, surface);
  await $.command.run(COMMAND);
  return $.ui.mount({ ...PANE, surface });
}

test("a session's start links the checkout, and says once what a link not simply there means", async ($, on) => {
  const w = world(on, { state: "adopted" });
  await start($);
  expect(w.toasts).toEqual([
    "notes: Moved 2 files from .agents/store into this repository's store and linked it.",
  ]);
  // The next prompt in the same folder asks nothing again.
  await $.prompt.submit({ text: "hello", origin: { kind: "composer" }, wait: false });
  expect(w.toasts).toHaveLength(1);
});

test("the agent is told where its files go where the checkout has a store", async ($, on) => {
  world(on);
  await start($);
  const context = await $.prompt.context({ blocks: [{ name: "currentDate", text: "today" }] });
  const block = context.blocks.find((b) => b.name === "agentsStore");
  expect(block?.text).toContain("under `.agents/store/`");
  expect(context.blocks[0]?.name).toBe("currentDate");
});

test("outside git there is no store: no line for the agent, and the list says why", async ($, on) => {
  const w = world(on, { state: "not-git" });
  await start($);
  const context = await $.prompt.context({ blocks: [] });
  expect(context.blocks).toEqual([]);
  await $.command.run(COMMAND);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await shows(ui, /in no git repository/)).toBe(true);
  expect(w.toasts).toEqual([]);
  await ui.unmount();
});

test("/notes lists the notes by folder with their ages, the artefacts counted, memory last", async ($, on) => {
  world(on);
  const ui = await openList($);
  expect(await shows(ui, /Notes ── 4 notes/)).toBe(true);
  expect(await shows(ui, /plans +1 artefact/)).toBe(true);
  expect(await shows(ui, /❯ retry-after\.md +1h/)).toBe(true);
  expect(await shows(ui, /hub\/PLAN\.md +1d/)).toBe(true);
  expect(await shows(ui, /screens +1 artefact/)).toBe(true);
  expect(await shows(ui, /MEMORY\.md +9h/)).toBe(true);
  // Every control is a plain Button under its own key; the ring and the hotkeys draw nothing.
  const keys = (await ui.findAll({ type: "Button" })).map((b) => String(b.key));
  for (const key of [
    RETRY,
    REPORT,
    "row:memory:MEMORY.md",
    "main",
    "open",
    "frame:close",
    "kit-ring",
    "kit-key-o",
    "kit-key-j",
    "kit-key-k",
  ])
    expect(keys).toContain(key);
  await ui.unmount();
});

test("Enter reads the note in the pane, and Back goes back to the list at the same row", async ($, on) => {
  world(on);
  const ui = await openList($);
  await ui.press({ key: "kit-key-j" });
  await ui.press({ key: "kit-key-k" });
  await ui.press({ key: "kit-ring" });
  expect(await shows(ui, /^ *plans\/retry-after\.md *$/)).toBe(true);
  expect(await shows(ui, /─ plans ── 1h ─/)).toBe(true);
  expect(await shows(ui, /The sync worker honours it now\./)).toBe(true);
  expect(await ui.find({ type: "Button", key: "back" })).toBeDefined();
  await ui.press({ key: "back" });
  expect(await shows(ui, /❯ retry-after\.md/)).toBe(true);
  await ui.unmount();
});

test("o hands the note to the first app that takes a file, detached; an HTML note goes to the browser", async ($, on) => {
  const w = world(on);
  const ui = await openList($);
  await ui.press({ key: "kit-key-o" });
  expect(w.launched).toEqual([
    ["/usr/bin/code", "--reuse-window", "--goto", `${STORE}/plans/retry-after.md`],
  ]);
  expect(w.toasts).toContain("Opened retry-after.md in VS Code");
  // A click lands the ring on a row first; Enter there opens an HTML note in the browser.
  await $.ui.focus({
    component: "Pane",
    requestId: "notes",
    element: REPORT,
    origin: { kind: "person" },
  });
  expect(await shows(ui, /❯ eval\.html/)).toBe(true);
  await ui.press({ key: "kit-ring" });
  expect(w.launched.at(-1)).toEqual(["/usr/bin/xdg-open", `file://${STORE}/reports/eval.html`]);
  await ui.unmount();
});

test("a note over 256 KiB is not read: the reader says so and lights Open", async ($, on) => {
  world(on, {
    files: {
      ...STORE_FILES,
      [`${STORE}/plans/retry-after.md`]: { text: "big", at: NOW - HOUR, size: 300 * 1024 },
    },
  });
  const ui = await openList($);
  await ui.press({ key: RETRY });
  expect(await shows(ui, /This note is 300 KiB, too large to read here\./)).toBe(true);
  expect(await shows(ui, /The sync worker/)).toBe(false);
  await ui.unmount();
});

test("a turn that writes a note puts it above the prompt; its way in reads it, Dismiss takes it down", async ($, on) => {
  const w = world(on);
  await start($);
  const band = async () => {
    const mounted = await $.ui.mount({ ...BAND, surface: "terminal" });
    const found = await mounted.find({ type: "Button", key: "notes:read" });
    await mounted.unmount();
    return found?.text;
  };
  await $.turn.complete(TURN);
  // Nothing was written since the session started.
  expect(await band()).toBeUndefined();
  w.files.set(`${STORE}/plans/new.md`, { text: "# New\n\nFresh.", at: NOW + 1 });
  await $.turn.complete(TURN);
  expect(await band()).toMatch(/Note written: plans\/new\.md read/);
  const mounted = await $.ui.mount({ ...BAND, surface: "terminal" });
  expect(await mounted.find({ type: "Button", key: "notes:dismiss" })).toBeDefined();
  await mounted.press({ key: "notes:read" });
  await mounted.unmount();
  expect(w.opened).toEqual(["notes"]);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await shows(ui, /Fresh\./)).toBe(true);
  // The pane's Close closes it; the band comes back for what is written after.
  await ui.press({ key: "frame:close" });
  await ui.unmount();
  // Looking moved the time notes are news from: the band is down.
  expect(await band()).toBeUndefined();

  w.files.set(`${STORE}/plans/newer.md`, { text: "x", at: NOW + 2 });
  await $.turn.complete(TURN);
  const again = await $.ui.mount({ ...BAND, surface: "terminal" });
  await again.press({ key: "notes:dismiss" });
  await again.unmount();
  expect(await band()).toBeUndefined();
});

// The graphical drawing is the kit's own: the same list and reader in the elements those surfaces
// draw (Markdown, real Buttons, no cells).
for (const surface of ["desktop", "vscode"] as const) {
  test(`${surface}: the list, a row's button reads it, and Back`, async ($, on) => {
    world(on);
    const ui = await openList($, surface);
    expect(await ui.find({ type: "Text", text: /^4 notes$/ })).toBeDefined();
    expect(await ui.find({ text: /^plans$/ })).toBeDefined();
    expect(await ui.find({ text: /retry-after\.md/ })).toBeDefined();
    expect((await ui.find({ type: "Button", key: RETRY }))?.text).toBe("Read");
    expect((await ui.find({ type: "Button", key: REPORT }))?.text).toBe("Open");
    // The headings take no count: the folders' other files are counted under the list.
    expect(await ui.find({ text: /^1 artefact in plans and 1 in screens\.$/ })).toBeDefined();
    await expectNative(ui);
    await ui.press({ key: RETRY });
    expect(
      await ui.find({ type: "Markdown", text: /The sync worker honours it now\./ }),
    ).toBeDefined();
    expect(await ui.find({ text: /plans · 1h/ })).toBeDefined();
    expect(await ui.find({ type: "Button", key: "back" })).toBeDefined();
    expect(await ui.find({ type: "Button", key: "open" })).toBeDefined();
    await expectNative(ui);
    await ui.press({ key: "back" });
    expect((await ui.find({ type: "Button", key: RETRY }))?.text).toBe("Read");
    await ui.unmount();
  });

  test(`${surface}: an empty store says so`, async ($, on) => {
    world(on, { files: {} });
    const ui = await openList($, surface);
    expect(await ui.find({ text: /^No notes yet\./ })).toBeDefined();
    await expectNative(ui);
    await ui.unmount();
  });

  test(`${surface}: the band has the note's words, Read and Dismiss`, async ($, on) => {
    const w = world(on);
    await start($, surface);
    w.files.set(`${STORE}/plans/new.md`, { text: "# New", at: NOW + 1 });
    await $.turn.complete(TURN);
    const band = await $.ui.mount({ ...BAND, surface });
    expect(await band.find({ text: /^Note written: plans\/new\.md$/ })).toBeDefined();
    expect((await band.find({ type: "Button", key: "notes:read" }))?.text).toBe("Read");
    expect((await band.find({ type: "Button", key: "notes:dismiss" }))?.text).toBe("Dismiss");
    await expectNative(band);
    await band.press({ key: "notes:dismiss" });
    await band.unmount();
    const after = await $.ui.mount({ ...BAND, surface });
    expect(await after.find({ type: "Button", key: "notes:read" })).toBeUndefined();
    await after.unmount();
  });
}

// ---- control characters: the engine refuses a tree that holds one, and a terminal obeys it

const ESC = "\u001b";
const ODD = `plans/odd${ESC}]0;owned\u0007.md`;
const ODD_SHOWN = "plans/odd�]0;owned�.md";

for (const surface of ["terminal", "vscode"] as const) {
  test(`${surface}: an escape in a file name and in a note still draws the list and the reader`, async ($, on) => {
    world(on, {
      files: {
        ...STORE_FILES,
        [`${STORE}/${ODD}`]: {
          text: `# Odd\n\nline${ESC}[2J one\fmore\r\nline two ${ESC}]52;c;eA==\u0007\n`,
          at: NOW - 2 * HOUR,
        },
        [`${STORE}/pl${ESC}[1mans/other.md`]: { text: "# Other\n", at: NOW - 3 * HOUR },
      },
    });
    const ui = await openList($, surface);
    expect(await ui.find({ text: /odd�\]0;owned�\.md/ })).toBeDefined();
    expect(await ui.find({ text: /retry-after\.md/ })).toBeDefined();
    if (surface !== "terminal") await expectNative(ui);
    await ui.press({ key: `row:${ODD_SHOWN.replace("plans/", "plans:plans/")}` });
    expect(await ui.find({ text: /line�\[2J one�more/ })).toBeDefined();
    expect(await ui.find({ text: /line two �\]52;c;eA==�/ })).toBeDefined();
    if (surface !== "terminal") await expectNative(ui);
    await ui.unmount();
  });
}

// ---- a link that failed or was busy is left alone, a turn's hooks run it at most once

const turn = ($: Engine) =>
  $.prompt.submit({ text: "hi", origin: { kind: "composer" }, wait: false });

for (const [name, ensure] of [
  ["busy", () => ok("root\t/repo\nstate\tbusy\n")],
  ["failed", () => ok("root\t/repo\nstate\tfailed\ndetail\tcannot link\n", 1)],
  ["timed out", () => ({ deny: "timed out" })],
] as const) {
  test(`a ${name} link is not run again for 30 s, whatever the hook; /notes asks at once`, async ($, on) => {
    const w = world(on);
    w.ensure = ensure;
    await start($);
    expect(w.ensured).toHaveLength(1);
    await turn($);
    await $.prompt.context({ blocks: [] });
    await $.turn.complete(TURN);
    await $.turn.complete(TURN);
    expect(w.ensured).toHaveLength(1);
    await w.clock.advance(29_000);
    await turn($);
    await $.turn.complete(TURN);
    expect(w.ensured).toHaveLength(1);
    await w.clock.advance(1_000);
    // Once for the event, not once at its start and again for the shelf.
    await $.turn.complete(TURN);
    expect(w.ensured).toHaveLength(2);
    await turn($);
    expect(w.ensured).toHaveLength(2);
    // The person asking does not wait out the back-off.
    await $.command.run(COMMAND);
    expect(w.ensured).toHaveLength(3);
  });
}

test("a busy store says so in the list, and the next /notes asks again", async ($, on) => {
  const w = world(on);
  w.ensure = () => ok("root\t/repo\nstate\tbusy\n");
  await start($);
  await $.command.run(COMMAND);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await shows(ui, /Another session is setting up this repository's store/)).toBe(true);
  await ui.unmount();
  w.ensure = undefined;
  await $.command.run(COMMAND);
  const again = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await shows(again, /Another session is setting up/)).toBe(false);
  expect(await shows(again, /retry-after\.md/)).toBe(true);
  await again.unmount();
});

const ISOLATE = { name: "wt", from: ROOT, for: "session", base: "head" } as const;

test("a worktree made before the session starts is linked from the environment, with no false notice", async ($, on) => {
  const w = world(on);
  const made = await $.vcs.isolate(ISOLATE);
  expect("path" in made && made.path).toBe("/repo-wt");
  expect(w.ensured).toEqual(["/repo-wt"]);
  expect(w.toasts).toEqual([]);
  await start($);
  expect(w.toasts).toEqual([]);
});

test("a notice is told once it was shown, then no more", async ($, on) => {
  const w = world(on, { state: "adopted" });
  await $.vcs.isolate(ISOLATE);
  await start($);
  await turn($);
  expect(w.toasts).toHaveLength(1);
});

// ---- Escape on a reader whose note is gone

// The `ui.close` hook goes back from a reader and closes from the list, and the engine raises it
// for Escape, which a test's `$` cannot (the decision is `isReaderLive`, specced in
// `lib/screen.spec.ts`). These show the pane the walk and the band leave: the list, never a reader
// on a note that is gone, and a reader on one that is still there kept.

test("a reader on a note that left the store is dropped when the shelf is walked again", async ($, on) => {
  const w = world(on);
  const ui = await openList($);
  await ui.press({ key: RETRY });
  // Still there after a walk: Escape goes back from it.
  await $.turn.complete(TURN);
  expect(await shows(ui, /The sync worker honours it now\./)).toBe(true);
  // Gone: the list, so Escape closes instead of being reclaimed.
  w.files.delete(`${STORE}/plans/retry-after.md`);
  await $.turn.complete(TURN);
  expect(await shows(ui, /The sync worker honours it now\./)).toBe(false);
  expect(await shows(ui, /hub\/PLAN\.md/)).toBe(true);
  await ui.unmount();
});

test("the band's way in to a note that is gone opens the list, with no reader to leave", async ($, on) => {
  const w = world(on);
  await start($);
  w.files.set(`${STORE}/plans/new.md`, { text: "# New", at: NOW + 1 });
  await $.turn.complete(TURN);
  w.files.delete(`${STORE}/plans/new.md`);
  const band = await $.ui.mount({ ...BAND, surface: "terminal" });
  await band.press({ key: "notes:read" });
  await band.unmount();
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await shows(ui, /❯ retry-after\.md/)).toBe(true);
  expect(w.opened).toEqual(["notes"]);
  await ui.unmount();
});

// ---- the line for the agent is for the shared store, and is sent again when that changes

for (const state of ["tracked", "conflict", "foreign", "file", "failed", "busy"]) {
  test(`${state}: the agent is not told the folder is the shared store`, async ($, on) => {
    world(on, { state });
    await start($);
    const context = await $.prompt.context({ blocks: [] });
    expect(context.blocks).toEqual([]);
  });
}

for (const state of ["ok", "linked", "adopted"]) {
  test(`${state}: the agent is told where its files go`, async ($, on) => {
    world(on, { state });
    await start($);
    const context = await $.prompt.context({ blocks: [] });
    expect(context.blocks.map((b) => b.name)).toEqual(["agentsStore"]);
  });
}

test("the line is asked for again when the first link failed and a later one made the store", async ($, on) => {
  const w = world(on, { state: "failed" });
  await start($);
  expect((await $.prompt.context({ blocks: [] })).blocks).toEqual([]);
  expect(w.invalidated).toEqual([]);
  w.state = "linked";
  // Still within the back-off: nothing has changed that the plugin knows of.
  await turn($);
  expect(w.invalidated).toEqual([]);
  await w.clock.advance(30_000);
  await turn($);
  expect(w.invalidated).toEqual(["prompt.context"]);
  expect((await $.prompt.context({ blocks: [] })).blocks.map((b) => b.name)).toEqual([
    "agentsStore",
  ]);
  // Answered with the line: further prompts leave it be.
  await turn($);
  expect(w.invalidated).toEqual(["prompt.context"]);
});

test("the line is asked for again when the session moves into a repository", async ($, on) => {
  const w = world(on);
  w.cwd = "/plain";
  w.ensure = (cwd) => (cwd === "/plain" ? ok("state\tnot-git\n") : ok(ensured("linked")));
  await $.session.start({ cwd: "/plain", surface: "terminal", isInteractive: true });
  expect((await $.prompt.context({ blocks: [] })).blocks).toEqual([]);
  w.cwd = ROOT;
  await turn($);
  expect(w.invalidated).toEqual(["prompt.context"]);
  expect((await $.prompt.context({ blocks: [] })).blocks).toHaveLength(1);
});

// ---- the band is this session's

test("the band counts the notes written in this session's turns, not another session's", async ($, on) => {
  const w = world(on);
  await start($);
  const band = async () => {
    const mounted = await $.ui.mount({ ...BAND, surface: "terminal" });
    const found = await mounted.find({ type: "Button", key: "notes:read" });
    await mounted.unmount();
    return found?.text;
  };
  const dismiss = async () => {
    const mounted = await $.ui.mount({ ...BAND, surface: "terminal" });
    await mounted.press({ key: "notes:dismiss" });
    await mounted.unmount();
  };
  await turn($);
  await w.clock.advance(5000);
  w.files.set(`${STORE}/plans/mine.md`, { text: "# Mine", at: w.clock.now() - 1000 });
  await $.turn.complete(TURN);
  expect(await band()).toMatch(/Note written: plans\/mine\.md/);
  await dismiss();

  // Another session writes between this one's turns: the store is shared, the note is not news.
  await w.clock.advance(60_000);
  w.files.set(`${STORE}/plans/theirs.md`, { text: "# Theirs", at: w.clock.now() });
  await w.clock.advance(10_000);
  await turn($);
  await w.clock.advance(1000);
  await $.turn.complete(TURN);
  expect(await band()).toBeUndefined();

  // One it writes while this session's turn runs is counted, whoever's it is.
  await turn($);
  await w.clock.advance(1000);
  w.files.set(`${STORE}/plans/during.md`, { text: "# During", at: w.clock.now() });
  await w.clock.advance(1000);
  await $.turn.complete(TURN);
  expect(await band()).toMatch(/Note written: plans\/during\.md/);
});
