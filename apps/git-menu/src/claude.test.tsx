import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";
import type { Engine, Mounted } from "claude-code/testing";

import { expectNative } from "./checks";

const PANE = {
  plugin: "git-menu",
  component: "Pane",
  requestId: "git-menu",
  props: {
    title: "Git",
    isFocused: true,
    bodyColumns: 60,
    placement: "inline",
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const;

const RUN = {
  origin: { kind: "composer" },
  presentation: { isFullscreen: true, columns: 160 },
  args: "",
} as const;

const PR =
  '{"url":"https://github.com/me/repo/pull/12","number":12,"state":"OPEN","isDraft":false}';

const HOME = "/home/me";
/** Where the checkout's `.agents/store` link lands. */
const STORE = `${HOME}/.local/share/agents/store/repo-1a2b3c4d`;
const OPENER = "/etc/profiles/per-user/me/bin/agent-note-open";
const NOW = Date.UTC(2026, 9, 31, 12);
const HOUR = 3_600_000;

type Notes = {
  /** The store's files, by path below it, each with its age in hours; undefined for no store. */
  files?: Record<string, number>;
  /** What `command -v` finds, by name or absolute path. */
  installed?: string[];
};

type World = {
  /** Every argv the mod ran that was not a read-only question. */
  launched: string[][];
  copied: string[];
  /** Every argv the mod ran at all. */
  ran: string[][];
};

const ok = (stdout: string, exitCode = 0, stderr = "") => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
});

function world(on: On, { pr = PR as string | null, mac = false, notes = {} as Notes } = {}): World {
  const w: World = { launched: [], copied: [], ran: [] };
  const installed = notes.installed ?? [OPENER];
  const files = Object.entries(notes.files ?? {});
  on("env.get", (_, e) => ({ value: ({ HOME, USER: "me" } as Record<string, string>)[e.name] }));
  on("clock.now", () => ({ value: NOW }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("ui.close", () => ({ value: undefined }));
  on("ui.panes", () => ({ value: [] }));
  on("ui.toast", () => ({ value: undefined }));
  on("ui.copy", (_, e) => {
    w.copied.push(e.text);
    return { value: { isCopied: true } };
  });
  on("session.cwd", () => ({ value: "/repo" }));
  on("fs.exists", () => ({ value: false }));
  on("fs.stat", (_, e) => {
    if (e.path !== "/repo/.agents/store" || !notes.files) throw new Error(`ENOENT: ${e.path}`);
    return { value: { kind: "dir", size: 0, mtimeMs: 0, isLink: true, realPath: STORE } };
  });
  on("fs.list", (_, e) => {
    const below = e.path === STORE ? "" : `${e.path.slice(STORE.length + 1)}/`;
    const entries = new Map<string, { kind: "file" | "dir"; mtimeMs: number }>();
    for (const [file, hours] of files) {
      if (!file.startsWith(below)) continue;
      const [name = "", ...rest] = file.slice(below.length).split("/");
      entries.set(
        name,
        rest.length ? { kind: "dir", mtimeMs: 0 } : { kind: "file", mtimeMs: NOW - hours * HOUR },
      );
    }
    return {
      value: [...entries].map(([name, entry]) => ({ name, size: 0, isLink: false, ...entry })),
    };
  });
  on("process.run", (_, e) => {
    const argv = [...e.argv];
    const line = argv.join(" ");
    w.ran.push(argv);
    if (argv[0] === "uname") return ok(mac ? "Darwin\n" : "Linux\n");
    if (argv[0] === "gh")
      return pr === null ? ok("", 1, "no pull requests found for branch") : ok(pr);
    if (argv[0] === "git") {
      if (line.includes(" status ")) {
        return ok(
          "# branch.oid abc1234def\n# branch.head feat/x\n# branch.upstream origin/feat/x\n",
        );
      }
      if (line.includes("--get-regexp"))
        return ok("remote.origin.url git@github.com:me/repo.git\n");
      if (line.endsWith("branch.feat/x.remote")) return ok("origin\n");
      if (line.includes("symbolic-ref")) return ok("origin/main\n");
      if (line.endsWith("rev-parse --git-dir")) return ok(".git\n");
      if (line.endsWith("rev-parse --show-toplevel")) return ok("/repo\n");
      return ok("", 1);
    }
    // `command -v` over a command's candidates.
    if (argv[0] === "sh" && argv.includes("agent-note-open")) {
      const hit = argv.slice(4).find((c) => installed.includes(c));
      if (!hit) return ok("", 1);
      return ok(`${hit.includes("/") ? hit : `/run/current-system/sw/bin/${hit}`}\n`);
    }
    // The probe for installed apps.
    if (argv[0] === "sh" && argv.includes("xdg-open") && argv.includes("nautilus")) {
      return ok("code\nxdg-open\n");
    }
    w.launched.push(argv.slice(4));
    return ok("");
  });
  return w;
}

type Surface = "terminal" | "desktop" | "vscode";

async function start($: Engine, on: On, surface: Surface = "terminal") {
  on("command.register", (_, e) => ({ value: { command: e.name } }));
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  await $.session.start({ cwd: "/repo", surface, isInteractive: true });
}

test("/git opens the branch's pull request on the forge", async ($, on) => {
  const w = world(on);
  await start($, on);
  for (const surface of ["terminal", "desktop"] as const) {
    w.launched = [];
    await $.command.run({ ...RUN, command: "git" });
    const pane = await $.ui.mount({ ...PANE, surface });
    await pane.press({ key: "pr" });
    await pane.unmount();
    expect(w.launched).toEqual([["xdg-open", "https://github.com/me/repo/pull/12"]]);
  }
});

test("a row that cannot run starts nothing", async ($, on) => {
  const w = world(on);
  await start($, on);
  await $.command.run({ ...RUN, command: "git" });

  // The branch already has an open pull request, so there is none to create.
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: "create" });
  await pane.unmount();
  expect(w.launched).toEqual([]);
});

test("without a pull request, create links the compare page into the default branch", async ($, on) => {
  const w = world(on, { pr: null });
  await start($, on);
  await $.command.run({ ...RUN, command: "git" });

  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: "create" });
  await pane.unmount();
  expect(w.launched).toContainEqual([
    "xdg-open",
    "https://github.com/me/repo/compare/main...feat/x?expand=1",
  ]);
});

test("the copy row puts the branch name on the clipboard", async ($, on) => {
  const w = world(on);
  await start($, on);
  await $.command.run({ ...RUN, command: "git" });

  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: "copy" });
  await pane.unmount();
  expect(w.copied).toEqual(["feat/x"]);
});

test("/open hands the checkout to an installed app and not to a missing one", async ($, on) => {
  const w = world(on);
  await start($, on);
  await $.command.run({ ...RUN, command: "open" });

  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: "smerge" });
  expect(w.launched).toEqual([]);
  await pane.press({ key: "code" });
  await pane.unmount();
  expect(w.launched).toEqual([["code", "/repo"]]);
});

/** The pane's rows, top to bottom, as `label description`. */
async function shownRows($: Engine, surface: Surface = "terminal") {
  const pane = await $.ui.mount({ ...PANE, surface });
  const buttons = await pane.findAll({ type: "Button" });
  await pane.unmount();
  return buttons.map((b) => b.text.replace(/\s+/g, " ").trim());
}

const openPlan = ($: Engine) => $.command.run({ ...RUN, command: "open", args: "plan" });

/** Everything the pane says. */
async function paneText($: Engine, surface: Surface = "terminal") {
  const pane = await $.ui.mount({ ...PANE, surface });
  const texts = await pane.findAll({ type: "Text" });
  await pane.unmount();
  return texts.map((t) => t.text).join(" ");
}

const NOTE = `${STORE}/plans/hub/PLAN.md`;

test("/open plan lists the store's Markdown, newest first, and asks no hub", async ($, on) => {
  const w = world(on, {
    notes: {
      files: {
        "research/old/REPORT.md": 48,
        "plans/hub/PLAN.md": 1,
        "plans/hub/HANDOFF.md": 3,
        "plans/hub/shot.png": 1,
        "plans/hub/history/PLAN.prev.md": 2,
        "plans/hub/files/output.md": 2,
        ".cache/index.md": 1,
      },
    },
  });
  await start($, on);
  await openPlan($);
  expect(await shownRows($)).toEqual([
    "plans/hub/PLAN.md 1h",
    "plans/hub/HANDOFF.md 3h",
    "research/old/REPORT.md 2d",
  ]);
  expect(w.ran.filter((argv) => argv.some((arg) => arg.includes("agent-hub")))).toEqual([]);
});

test("with an empty store, /open plan says so", async ($, on) => {
  world(on, { notes: { files: {} } });
  await start($, on);
  await openPlan($);
  expect(await paneText($)).toContain("No notes yet.");
});

test("without a store, /open plan says there are no notes", async ($, on) => {
  world(on);
  await start($, on);
  await openPlan($);
  expect(await paneText($)).toContain("No notes yet.");
});

test("pressing a note hands its path to the opener", async ($, on) => {
  const w = world(on, { notes: { files: { "plans/hub/PLAN.md": 1 } } });
  await start($, on);
  await openPlan($);
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: NOTE });
  await pane.unmount();
  expect(w.launched).toEqual([[OPENER, NOTE]]);
});

test("without the opener installed, a note opens in VS Code", async ($, on) => {
  const w = world(on, { notes: { files: { "plans/hub/PLAN.md": 1 }, installed: ["code"] } });
  await start($, on);
  await openPlan($);
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: NOTE });
  await pane.unmount();
  expect(w.launched).toEqual([["/run/current-system/sw/bin/code", "--reuse-window", NOTE]]);
});

test("the folder menu's Notes row switches the pane to the notes", async ($, on) => {
  const w = world(on, { notes: { files: { "plans/hub/PLAN.md": 1 } } });
  await start($, on);
  await $.command.run({ ...RUN, command: "open" });
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: "notes" });
  await pane.unmount();
  expect(w.launched).toEqual([]);
  expect(await shownRows($)).toEqual(["plans/hub/PLAN.md 1h"]);
});

test("bare /open still shows the folder menu", async ($, on) => {
  world(on);
  await start($, on);
  await $.command.run({ ...RUN, command: "open" });
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  const keys = (await pane.findAll({ type: "Button" })).map((b) => b.key);
  await pane.unmount();
  expect(await paneText($)).toContain("Open folder");
  // Which apps the machine has decides their rows; Notes and Copy path are the menu's own.
  expect(keys).toEqual(expect.arrayContaining(["code", "copy", "notes"]));
});

// On the graphical surfaces a row is text with a quiet button at its end; the checks are the style's
// (`expectNative`), what the pane says, and that a press does what a key does in the terminal.
for (const surface of ["desktop", "vscode"] as const) {
  /** The pane as the host opens it: titled with its menu's name. */
  const mount = ($: Engine, title: string) =>
    $.ui.mount({ ...PANE, props: { ...PANE.props, title }, surface });
  /** What the mounted pane's Text shows, in order; a Text inside a Text is one line, once. */
  const said = async (pane: Pick<Mounted, "findAll">) => [
    ...new Set((await pane.findAll({ type: "Text" })).map((t) => t.text)),
  ];

  test(`${surface}: /git draws a row per action, and a press runs it`, async ($, on) => {
    const w = world(on);
    await start($, on, surface);
    await $.command.run({ ...RUN, command: "git" });
    const pane = await $.ui.mount({ ...PANE, surface });
    await expectNative(pane);
    // The toolbar says which repository the rows act on; the pane's own title is the host's.
    expect(await said(pane)).toEqual(
      expect.arrayContaining(["me/repo", "Open repository", "github.com", "Open pull request #12"]),
    );
    for (const key of ["pr", "copy"])
      expect(await pane.find({ type: "Button", key })).toBeDefined();
    // The branch has a pull request already, so there is none to create: a row with no button.
    expect(await pane.find({ type: "Button", key: "create" })).toBeUndefined();
    expect(await pane.find({ type: "Text", text: "Create pull request" })).toBeDefined();
    await pane.press({ key: "pr" });
    await pane.unmount();
    expect(w.launched).toEqual([["xdg-open", "https://github.com/me/repo/pull/12"]]);
    await $.command.run({ ...RUN, command: "git" });
    const again = await $.ui.mount({ ...PANE, surface });
    await again.press({ key: "copy" });
    await again.unmount();
    expect(w.launched).toHaveLength(1);
    expect(w.copied).toEqual(["feat/x"]);
  });

  test(`${surface}: without a pull request, create is a button`, async ($, on) => {
    const w = world(on, { pr: null });
    await start($, on, surface);
    await $.command.run({ ...RUN, command: "git" });
    const pane = await $.ui.mount({ ...PANE, surface });
    await expectNative(pane);
    await pane.press({ key: "create" });
    await pane.unmount();
    expect(w.launched).toContainEqual([
      "xdg-open",
      "https://github.com/me/repo/compare/main...feat/x?expand=1",
    ]);
  });

  test(`${surface}: /open draws the folder menu, and a press hands the checkout to an app`, async ($, on) => {
    const w = world(on);
    await start($, on, surface);
    await $.command.run({ ...RUN, command: "open" });
    const pane = await mount($, "Open folder");
    await expectNative(pane);
    const keys = (await pane.findAll({ type: "Button" })).map((b) => b.key);
    expect(keys).toEqual(expect.arrayContaining(["code", "copy", "notes"]));
    // An app that is not installed keeps its row and says so, with no button to press.
    expect(keys).not.toContain("smerge");
    expect(await said(pane)).toEqual(expect.arrayContaining(["Sublime Merge", "not installed"]));
    await pane.press({ key: "code" });
    await pane.unmount();
    expect(w.launched).toEqual([["code", "/repo"]]);
  });

  test(`${surface}: no row carries a hotkey and no hint is drawn`, async ($, on) => {
    world(on);
    await start($, on, surface);
    await $.command.run({ ...RUN, command: "open" });
    const pane = await mount($, "Open folder");
    for (const b of await pane.findAll({ type: "Button" })) expect(b.props.hotkey).toBeUndefined();
    expect((await said(pane)).join(" ")).not.toMatch(/Enter|Esc/);
    await pane.unmount();
  });

  test(`${surface}: /open plan lists the notes newest first, and a press opens one`, async ($, on) => {
    const w = world(on, {
      notes: {
        files: { "research/old/REPORT.md": 48, "plans/hub/PLAN.md": 1, "plans/hub/HANDOFF.md": 3 },
      },
    });
    await start($, on, surface);
    await openPlan($);
    const pane = await mount($, "Notes");
    await expectNative(pane);
    expect(await said(pane)).toEqual([
      "3 notes",
      "plans/hub/PLAN.md",
      "1h",
      "plans/hub/HANDOFF.md",
      "3h",
      "research/old/REPORT.md",
      "2d",
    ]);
    await pane.press({ key: NOTE });
    await pane.unmount();
    expect(w.launched).toEqual([[OPENER, NOTE]]);
  });

  test(`${surface}: with no notes the pane says so and what makes them appear`, async ($, on) => {
    world(on);
    await start($, on, surface);
    await openPlan($);
    const pane = await mount($, "Notes");
    await expectNative(pane);
    expect(await said(pane)).toEqual([expect.stringContaining("No notes yet.")]);
    await pane.unmount();
  });

  test(`${surface}: a long list shows its first rows and one press shows the rest`, async ($, on) => {
    const w = world(on, {
      notes: {
        files: Object.fromEntries(
          Array.from({ length: 15 }, (_, i) => [`notes/n${String(i).padStart(2, "0")}.md`, i + 1]),
        ),
      },
    });
    await start($, on, surface);
    await openPlan($);
    const pane = await mount($, "Notes");
    await expectNative(pane);
    const rows = async (p: Pick<Mounted, "findAll">) =>
      (await p.findAll({ type: "Button" })).filter((b) => b.key !== "more").length;
    expect(await rows(pane)).toBe(12);
    expect(await pane.find({ type: "Button", key: "more" })).toBeDefined();
    await pane.press({ key: "more" });
    expect(await rows(pane)).toBe(15);
    expect(await pane.find({ type: "Button", key: "more" })).toBeUndefined();
    await expectNative(pane);
    await pane.unmount();
    expect(w.launched).toEqual([]);
  });

  test(`${surface}: a note nothing can open is a row with its path and no button`, async ($, on) => {
    world(on, { notes: { files: { "plans/hub/PLAN.md": 1 }, installed: [] } });
    await start($, on, surface);
    await openPlan($);
    const pane = await mount($, "Notes");
    await expectNative(pane);
    expect(await pane.findAll({ type: "Button" })).toEqual([]);
    expect(await said(pane)).toContain(`no editor: ${NOTE}`);
    await pane.unmount();
  });
}
