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
import { configPath, DETACH } from "@agents/launch/apps.ts";
import {
  buildMenu,
  COMMANDS,
  focusOf,
  GIT_TIMEOUT_MS,
  type Host,
  pressRow,
  type PressHost,
  problemsText,
  TITLES,
} from "./lib/gather.ts";
import type { MenuKind, Row } from "./lib/menus.ts";
import {
  CHROME,
  drawMenu,
  followTop,
  hitOf,
  INSET,
  maxTop,
  MORE,
  type Look,
  WHEEL_ROWS,
} from "./lib/screen.ts";

const PANE = "open";

const menu = atom({ plugin: "open", key: "menu" } as const, null);
/** Whether the rest of a long list is shown: a graphical surface lists the first few. */
const showAll = atom({ plugin: "open", key: "showAll" } as const, false);
/** The row the keyboard is on in a terminal, which draws its own focus. */
const focus = atom({ plugin: "open", key: "focus" } as const, null);
/** The terminal list's first line. */
const top = atom({ plugin: "open", key: "top" } as const, 0);
/** Whether the pane has the keyboard, as far as the mod knows. */
const held = atom({ plugin: "open", key: "held" } as const, false);

/** What the terminal drew last: the room the keys move the window in, and the rows that are controls. */
let drawn = { width: 60, height: 10 };
let hits = new Set<string>();
let paneSurface: RenderSurface | undefined;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

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

const isMac = ($: EngineInterface) =>
  (isMacAnswer ??= runProcess($, ["uname", "-s"]).then((r) => r?.stdout.trim() === "Darwin"));

/**
 * What the shared gathering (`lib/gather.ts`) asks of the mod: the engine runs the commands and
 * reads `open.json`, and a problem in it is a toast, each one in the debug log.
 */
function engineHost($: EngineInterface): Host {
  return {
    run: (argv, timeoutMs, cwd) => runProcess($, argv, timeoutMs, cwd),
    async config() {
      const [home, xdg, mac] = await Promise.all([
        $.env.get("HOME"),
        $.env.get("XDG_CONFIG_HOME"),
        isMac($),
      ]);
      const path = configPath({ HOME: home, XDG_CONFIG_HOME: xdg });
      const text =
        path && (await $.fs.exists(path).catch(() => false))
          ? await $.fs.read(path).catch(() => undefined)
          : undefined;
      return { text, platform: mac ? "mac" : "linux" };
    },
    report(problems) {
      const text = problemsText(problems);
      if (text) $.ui.toast(text);
      for (const problem of problems) $.ui.log(`open: ${problem}`, { to: "debug" });
    },
  };
}

/** What a press asks besides: the clipboard of the surface pressed on, a detached start, a toast. */
function pressHost($: EngineInterface, surface: RenderSurface): PressHost {
  return {
    ...engineHost($),
    copy: (text) => $.ui.copy({ text, surface }),
    async start(argv, cwd) {
      // Detached: `$.process.run` would wait for a GUI app's output to close.
      const r = await runProcess($, [...DETACH, ...argv], GIT_TIMEOUT_MS, cwd);
      return r?.exitCode === 0;
    },
    say: (text) => $.ui.toast(text),
  };
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
  const built = await buildMenu(engineHost($), kind, cwd);
  // A close or another menu while git answered wins over this one.
  await update($, menu, (m) => (m?.kind === kind && m.rows === null ? built : m));
  const shown = await read($, menu);
  const first = focusOf(shown, null);
  if (shown?.kind === kind && shown.rows !== null && first) await focusRow($, first);
}

/** Carries a row's press out; the menu closes unless the row could not run. */
async function press($: EngineInterface, row: Row, surface: RenderSurface) {
  if ((await pressRow(pressHost($, surface), row)) === "close") await close($);
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    for (const { name, description } of COMMANDS) {
      await $.command
        .register({ name, description, immediate: true })
        .catch((error) =>
          $.ui.log(`open: /${name} not registered: ${String(error)}`, { to: "debug" }),
        );
    }
    return next(e);
  });

  on("command.run", { command: "git" }, async ($) => {
    await show($, "git");
    return { text: "Opened the git menu." };
  });

  on("command.run", { command: "open" }, async ($) => {
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
