import { atom, read, update } from "claude-code";
import type { EngineInterface, ProcessRunResult, Register, RenderSurface } from "claude-code";

import { guiMenu } from "./claude/gui.tsx";
import { closeOf } from "@agents/kit-frame/contract.ts";
import { forSurface, guiOf, paneOptions } from "@agents/kit-core/paint/host.tsx";
import {
  keysHint,
  paintLines,
  ring,
  RING,
  ringMove,
  stack,
} from "@agents/kit-core/paint/claude.tsx";
import type { FolderApp, Menu, MenuKind, Row } from "./claude/types.d.ts";
import {
  chooseRemote,
  editorCandidates,
  folderMenu,
  gitMenu,
  parsePr,
  parseStatus,
  preferredEditor,
  type PrAnswer,
  type Status,
} from "./claude/menus";
import { holdsNotes, type Note, notesMenu, OPENER, STORE } from "./claude/notes";
import {
  CHROME,
  drawMenu,
  followTop,
  hitOf,
  INSET,
  maxTop,
  MORE,
  type Look,
} from "./claude/screen.ts";

const PANE = "git-menu";
const TITLES: Record<MenuKind, string> = { git: "Git", folder: "Open folder", notes: "Notes" };
/** Rows a turn of the wheel moves the window by. */
const WHEEL_ROWS = 3;
const GIT_TIMEOUT_MS = 3000;
const GH_TIMEOUT_MS = 5000;
// Starts a GUI app without holding $.process.run, which waits for the output to close.
const DETACH = [
  "sh",
  "-c",
  'exec >/dev/null 2>&1 </dev/null; if command -v setsid >/dev/null; then exec setsid -f "$@"; fi; "$@" &',
  "sh",
];

const menu = atom({ plugin: "git-menu", key: "menu" } as const, null);
/** Whether the rest of a long list is shown: a graphical surface lists the first few. */
const showAll = atom({ plugin: "git-menu", key: "showAll" } as const, false);
/** The row the keyboard is on in a terminal, which draws its own focus. */
const focus = atom({ plugin: "git-menu", key: "focus" } as const, null);
/** The terminal list's first line. */
const top = atom({ plugin: "git-menu", key: "top" } as const, 0);
/** Whether the pane has the keyboard, as far as the mod knows. */
const held = atom({ plugin: "git-menu", key: "held" } as const, false);

/** What the terminal drew last: the room the keys move the window in, and the rows that are controls. */
let drawn = { width: 60, height: 10 };
let hits = new Set<string>();
let paneSurface: RenderSurface | undefined;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** The row the keyboard is on: the one it was moved to, else the menu's own pick, else the first. */
const focusOf = (m: Menu | null, at: string | null) =>
  m?.rows?.find((r) => r.id === at)?.id ?? m?.preferred ?? m?.rows?.[0]?.id;

let isMacAnswer: Promise<boolean> | undefined;

const runProcess = async (
  $: EngineInterface,
  argv: string[],
  timeoutMs = GIT_TIMEOUT_MS,
  cwd?: string,
): Promise<ProcessRunResult | undefined> => {
  try {
    return await $.process.run(argv, { timeoutMs, ...(cwd ? { cwd } : {}) });
  } catch {
    return undefined;
  }
};

/** One read-only git command; anything it refuses is an empty answer. */
const git = async ($: EngineInterface, cwd: string, args: string[]) => {
  const r = await runProcess($, ["git", "--no-optional-locks", "-C", cwd, ...args]);
  return r?.exitCode === 0 ? r.stdout.trim() : "";
};

const isMac = ($: EngineInterface) =>
  (isMacAnswer ??= runProcess($, ["uname", "-s"]).then((r) => r?.stdout.trim() === "Darwin"));

async function lookupPr($: EngineInterface, cwd: string, status: Status): Promise<PrAnswer> {
  // A branch that was never pushed has no pull request yet, and that is an answer.
  if (!status.branch || !status.upstream) return null;
  let r: ProcessRunResult;
  try {
    r = await $.process.run(["gh", "pr", "view", "--json", "url,number,state,isDraft"], {
      cwd,
      timeoutMs: GH_TIMEOUT_MS,
    });
  } catch {
    return "no-gh";
  }
  if (r.exitCode !== 0) {
    // These two are answers; anything else (offline, auth, timeout) is not.
    return /no pull requests found|no git remotes found/.test(r.stderr) ? null : "unknown";
  }
  return parsePr(r.stdout) ?? "unknown";
}

/** The remote's default branch, then the local main/master refs, then `main`. */
async function defaultBranch($: EngineInterface, cwd: string, remote: string) {
  const head = await git($, cwd, [
    "symbolic-ref",
    "--quiet",
    "--short",
    `refs/remotes/${remote}/HEAD`,
  ]);
  if (head.startsWith(`${remote}/`)) return head.slice(remote.length + 1);
  for (const candidate of ["main", "master"]) {
    const ref = `refs/remotes/${remote}/${candidate}`;
    if (await git($, cwd, ["rev-parse", "--verify", "--quiet", ref])) return candidate;
  }
  return "main";
}

async function buildGit($: EngineInterface, cwd: string): Promise<Menu> {
  const out = await git($, cwd, ["status", "--porcelain=v2", "--branch", "--untracked-files=no"]);
  if (!out) return { kind: "git", title: TITLES.git, rows: [], error: "Not a git repository." };
  const status = parseStatus(out);
  const branch = status.branch;
  const [config, branchRemote, mergeBase, pr] = await Promise.all([
    git($, cwd, ["config", "--get-regexp", "^remote\\..*\\.url$"]),
    branch ? git($, cwd, ["config", "--get", `branch.${branch}.remote`]) : "",
    branch ? git($, cwd, ["config", "--get", `branch.${branch}.gh-merge-base`]) : "",
    lookupPr($, cwd, status),
  ]);
  const remote = chooseRemote(config, branchRemote);
  // Mirrors `gh pr create`: the branch's gh-merge-base, else the remote's default branch.
  const base = mergeBase || (remote ? await defaultBranch($, cwd, remote.name) : "main");
  return gitMenu({ status, remote, base, pr });
}

/** Open a fresh shell, using the desktop's terminal selection rather than the host terminal. */
async function terminalLauncher($: EngineInterface, cwd: string, mac: boolean) {
  const override = (await $.env.get("GIT_MENU_TERMINAL"))?.trim();
  if (override && (override.startsWith("/") || !override.includes("/"))) {
    // A single executable, not a command line. A wrapper can supply terminal-specific flags.
    const found = await locate($, override);
    if (found?.startsWith("/")) return [found];
  }
  if (mac) return ["open", "-a", "Terminal", cwd];
  const xdg = await locate($, "xdg-terminal-exec");
  if (xdg && (await runProcess($, [xdg, "--print-id"]))?.exitCode === 0)
    return [xdg, `--dir=${cwd}`];
  const alternative = await locate($, "x-terminal-emulator");
  return alternative ? [alternative] : undefined;
}

async function buildFolder($: EngineInterface, cwd: string): Promise<Menu> {
  const mac = await isMac($);
  const editor = preferredEditor(await $.env.get("FIREPROOF_EDITOR"));
  const launchers: Partial<Record<FolderApp, string[]>> = {};
  const terminal = terminalLauncher($, cwd, mac);
  if (mac) {
    const bundle = async (app: FolderApp, name: string) => {
      if (await $.fs.exists(`/Applications/${name}.app`))
        launchers[app] = ["open", "-a", name, cwd];
    };
    await Promise.all([
      bundle("code", "Visual Studio Code"),
      bundle("zed", "Zed"),
      bundle("smerge", "Sublime Merge"),
    ]);
    launchers.files = ["open", cwd];
  } else {
    const probe = await runProcess($, [
      "sh",
      "-c",
      'for c; do command -v "$c" >/dev/null && echo "$c"; done',
      "sh",
      ...editorCandidates(editor),
      "smerge",
      "nautilus",
      "xdg-open",
    ]);
    const found = new Set((probe?.stdout ?? "").split("\n").filter(Boolean));
    if (found.has("code")) launchers.code = ["code", cwd];
    // zed's own name first, in EDITOR_COMMANDS' order.
    const zed = ["zed", "zeditor"].find((name) => found.has(name));
    if (zed) launchers.zed = [zed, cwd];
    if (found.has("smerge")) launchers.smerge = ["smerge", cwd];
    if (found.has("nautilus")) launchers.files = ["nautilus", cwd];
    else if (found.has("xdg-open")) launchers.files = ["xdg-open", cwd];
  }
  const launcher = await terminal;
  if (launcher) launchers.terminal = launcher;
  return folderMenu(cwd, launchers, mac, editor);
}

/** A command by absolute path: on PATH, then the profiles a trimmed PATH may miss, then `also`. */
async function locate($: EngineInterface, name: string, also: string[] = []) {
  const [home, user] = await Promise.all([$.env.get("HOME"), $.env.get("USER")]);
  const probe = await runProcess($, [
    "sh",
    "-c",
    'for c; do command -v "$c" && exit 0; done; exit 1',
    "sh",
    name,
    ...(user ? [`/etc/profiles/per-user/${user}/bin/${name}`] : []),
    `${home ?? ""}/.nix-profile/bin/${name}`,
    ...also,
  ]);
  return probe?.exitCode === 0 ? probe.stdout.trim().split("\n")[0] : undefined;
}

/** The Markdown under `dir`, a store directory by its real path; `below` is the path so far. */
async function notesUnder($: EngineInterface, dir: string, below = ""): Promise<Note[]> {
  const entries = await $.fs.list(dir).catch(() => []);
  const found = await Promise.all(
    entries.map(async (entry): Promise<Note[]> => {
      const name = `${below}${entry.name}`;
      if (entry.kind === "dir")
        return holdsNotes(entry.name) ? notesUnder($, `${dir}/${entry.name}`, `${name}/`) : [];
      return entry.kind === "file" && entry.name.endsWith(".md")
        ? [{ path: `${dir}/${entry.name}`, name, at: entry.mtimeMs }]
        : [];
    }),
  );
  return found.flat();
}

async function buildNotes($: EngineInterface, cwd: string): Promise<Menu> {
  const editor = preferredEditor(await $.env.get("FIREPROOF_EDITOR"));
  const [root, found, now] = await Promise.all([
    git($, cwd, ["rev-parse", "--show-toplevel"]),
    locate($, OPENER, editorCandidates(editor)),
    $.clock.now(),
  ]);
  // The store is a link out of the checkout; a listing does not follow one.
  const store = await $.fs
    .stat(`${root || cwd}/${STORE}`, { resolve: true })
    .catch(() => undefined);
  const notes = store?.realPath ? await notesUnder($, store.realPath) : [];
  // `code` lands in the focused window only when told; zed does that on its own.
  const opener = found
    ? found.endsWith("/code")
      ? [found, "--reuse-window"]
      : [found]
    : undefined;
  return notesMenu({ notes, opener, now });
}

const isOpen = async ($: EngineInterface) => (await $.ui.panes()).some((p) => p.id === PANE);

async function reset($: EngineInterface) {
  await update($, menu, () => null);
  await update($, showAll, () => false);
  await update($, focus, () => null);
  await update($, top, () => 0);
  await update($, held, () => false);
}

async function close($: EngineInterface) {
  await reset($);
  await $.ui.close({ id: PANE });
}

/** Puts the keyboard on a row and keeps it in the window. */
async function focusRow($: EngineInterface, id: string) {
  const m = await read($, menu);
  if (!m?.rows) return;
  await update($, focus, () => id);
  const look: Look = { focus: id, held: true, top: await read($, top) };
  const next = followTop(m.rows, look, drawn.width, drawn.height);
  await update($, top, () => next);
}

async function moveFocus($: EngineInterface, by: number) {
  const m = await read($, menu);
  const rows = m?.rows ?? [];
  const current = focusOf(m, await read($, focus));
  const at = rows.findIndex((r) => r.id === current);
  const to = rows[clamp(at + by, 0, rows.length - 1)];
  if (to) await focusRow($, to.id);
}

/**
 * Opens a menu, or closes it when it is already up. The pane opens before git
 * answers: one opened after the command hook returned counts as unasked and
 * stays hidden on narrower terminals.
 */
async function show($: EngineInterface, kind: MenuKind) {
  if ((await read($, menu))?.kind === kind && (await isOpen($))) return close($);
  const cwd = await $.session.cwd();
  const title = TITLES[kind];
  await update($, menu, () => ({ kind, title, rows: null }));
  await update($, showAll, () => false);
  await update($, focus, () => null);
  await update($, top, () => 0);
  // Opened with the keyboard.
  await update($, held, () => true);
  const opened = await $.ui.open(
    paneOptions({ id: PANE, title, focus: true, closeOnEscape: true, rows: 10 }),
  );
  if (!opened.isPlaced) $.ui.toast(`The ${title} menu can't show yet: ${opened.reason}`);
  const built =
    kind === "git"
      ? await buildGit($, cwd)
      : kind === "folder"
        ? await buildFolder($, cwd)
        : await buildNotes($, cwd);
  // A close or another menu while git answered wins over this one.
  await update($, menu, (m) => (m?.kind === kind && m.rows === null ? built : m));
  const shown = await read($, menu);
  const first = focusOf(shown, null);
  if (shown?.kind === kind && shown.rows !== null && first) await focusRow($, first);
}

async function press($: EngineInterface, row: Row, surface: RenderSurface) {
  if (!row.action) {
    $.ui.toast(`${row.label}: ${row.unavailable ?? "not available"}`);
    return;
  }
  const action = row.action;
  if (action.kind === "menu") return show($, action.menu);
  if (action.kind === "copy") {
    const r = await $.ui.copy({ text: action.text, surface });
    $.ui.toast(r.isCopied ? `Copied the ${action.what}` : `Couldn't copy: ${r.reason}`);
  } else {
    const argv =
      action.kind === "url" ? [(await isMac($)) ? "open" : "xdg-open", action.url] : action.argv;
    const r = await runProcess(
      $,
      [...DETACH, ...argv],
      GIT_TIMEOUT_MS,
      action.kind === "launch" ? action.cwd : undefined,
    );
    if (r?.exitCode !== 0) $.ui.toast(`Couldn't start ${argv[0]}`);
  }
  await close($);
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    for (const [name, description, argumentHint] of [
      ["git", "Open the git menu: the repository, branch and pull request on the forge", undefined],
      [
        "open",
        "Open the folder menu: this checkout in an editor, file manager or terminal; `plan` opens one of this checkout's notes",
        "[plan]",
      ],
    ] as const) {
      await $.command
        .register({ name, description, argumentHint, immediate: true })
        .catch((error) =>
          $.ui.log(`git-menu: /${name} not registered: ${String(error)}`, { to: "debug" }),
        );
    }
    return next(e);
  });

  on("command.run", { command: "git" }, async ($) => {
    await show($, "git");
    return { text: "Opened the git menu." };
  });

  on("command.run", { command: "open" }, async ($, e) => {
    if (e.args.trim() === "plan") {
      await show($, "notes");
      return { text: "Opened this checkout's notes." };
    }
    await show($, "folder");
    return { text: "Opened the folder menu." };
  });

  on("ui.close", { id: PANE }, async ($, e, next) => {
    await reset($);
    return next(e);
  });

  on("ui.focus", { requestId: PANE }, async ($, e, next) => {
    // The terminal draws its own focus: the engine's ring stays parked on a button that draws
    // nothing, and its moves become the menu's (`ring` and `ringMove` in the kit).
    if (paneSurface !== "terminal") return next(e);
    const move = ringMove(e.element, (hit) => hits.has(hit));
    if (move && "hit" in move) await focusRow($, move.hit);
    else if (move?.by) await moveFocus($, move.by);
    const moved = await next(move ? { ...e, element: RING.park } : e);
    if (!moved.deny) await update($, held, () => true);
    return moved;
  }).catch((_$, e, next) => next(e));

  // The wheel moves the terminal list's window.
  on("ui.scroll", { requestId: PANE }, async ($, e, next) => {
    if (paneSurface !== "terminal") return next(e);
    const rows = (await read($, menu))?.rows;
    if (rows) {
      const by = e.pointer ? WHEEL_ROWS * Math.sign(e.by) : e.by;
      const max = maxTop(rows, await read($, held), drawn.width, drawn.height);
      await update($, top, (t) => clamp(t + by, 0, max));
    }
    return {};
  }).catch((_$, e, next) => next(e));

  // What the person types goes to the prompt, which then has the keyboard.
  on("prompt.edit", async ($, e, next) => {
    if (await read($, held)) await update($, held, () => false);
    return next(e);
  });
  on("prompt.change", async ($, e, next) => {
    if (e.origin.kind !== "plugin" && (await read($, held))) await update($, held, () => false);
    return next(e);
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    paneSurface = e.surface;
    const els = $.ui.resolve(e);
    const m = await read($, menu);
    const isAll = await read($, showAll);
    /** A press on a control of the screen: a row, `more`, or the frame's Close. */
    const pressHit = async (hit: string) => {
      if (closeOf(hit) === "close") return close($);
      if (hit === MORE) return update($, showAll, () => true);
      const row = (await read($, menu))?.rows?.find((r) => hitOf(r) === hit);
      if (row) await press($, row, e.surface);
    };
    return forSurface(e, {
      tui: async () => {
        // A docked pane keeps a cell from the engine's divider; an inline one has its box's.
        const pad = e.props.placement === "inline" ? 0 : 1;
        const width = Math.max(20, e.props.bodyColumns - pad);
        drawn = { width, height: Math.max(CHROME + 1, e.props.scroll.bodyRows) };
        hits = new Set(m?.rows?.filter((r) => r.action).map(hitOf));
        const isHeld = await read($, held);
        const look: Look = {
          focus: focusOf(m, await read($, focus)),
          held: isHeld,
          top: await read($, top),
        };
        const screen = drawMenu(m, look, width, drawn.height);
        const rows = m?.rows ?? [];
        return stack(
          els,
          ring(
            els,
            async () => {
              const now = await read($, menu);
              const at = focusOf(now, await read($, focus));
              const row = now?.rows?.find((r) => r.id === at);
              if (row) await press($, row, e.surface);
            },
            rows.slice(0, 9).map((row, i) => ({
              key: String(i + 1),
              press: () => press($, row, e.surface),
            })),
          ),
          screen.head
            ? paintLines(els, [screen.head], { press: pressHit, width, indent: pad })
            : null,
          paintLines(els, screen.body, {
            press: pressHit,
            width: width - INSET,
            indent: pad + INSET,
          }),
          // The hint says where the keys are while they are not here; else the pane's own.
          isHeld && screen.hint.length === 0
            ? null
            : (keysHint(els, isHeld, false, pad + INSET) ??
                paintLines(els, screen.hint, { width: width - INSET, indent: pad + INSET })),
        );
      },
      gui: async () => guiMenu(guiOf(els, e, pressHit), m, isAll),
    });
  });
};
