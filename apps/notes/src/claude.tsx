/**
 * The Claude Code half of notes: the link from each checkout to its repository's store, the line
 * that tells the agent where its files go, /notes, and the band above the prompt for notes a turn
 * wrote. What the link, the walk and a hand-off do is the lib's (`lib/gather.ts`), the steps pi's
 * half runs too, over a host made of the engine's calls.
 *
 * In the terminal the pane is the screen pi draws too (`lib/screen.ts`), painted by the kit with
 * its own focus: the notes under their folders and the reader. Desktop and VS Code draw the same
 * list and reader with the kit's graphical components (`claude/gui.tsx`).
 */
import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";
import { captionFrameLayout } from "@agents/kit-frame/contract.ts";
import { blank } from "@agents/kit-core/lines.ts";
import { forSurface, guiOf, paneOptions } from "@agents/kit-core/paint/host.tsx";
import {
  keysHint,
  paintLines,
  ring,
  RING,
  ringMove,
  stack,
} from "@agents/kit-core/paint/claude.tsx";
import type { Platform } from "@agents/launch/apps.ts";
import { configPath } from "@agents/launch/apps.ts";
import {
  createLinks,
  ensureAt,
  handNote,
  linkNotice,
  loadGroups,
  memoryDirOf,
  noticeText,
  placeOf,
  readBody,
  type Host,
} from "./lib/gather.ts";
import {
  BAND,
  bandLine,
  bandOf,
  drawScreen,
  isReaderLive,
  isScreenHit,
  keyIntent,
  reduce,
  TITLE,
  WHEEL_ROWS,
  zoneAt,
  type Effect,
  type Intent,
  type ScreenOptions,
  type ScreenState,
} from "./lib/screen.ts";
import { notesOf } from "./lib/shelf.ts";
import { beginTurn, duringTurns, endTurn, startTurns, type Turns } from "./lib/turns.ts";
import { CONTEXT, isShared, storeRoot, type Ensured } from "./lib/store.ts";
import type { Listed } from "./lib/walk.ts";
import { MORE, notesBand, notesPane } from "./claude/gui.tsx";
import type { Band, Shelf, View } from "./claude/types.d.ts";

const PANE = "notes";
/** The name of the block that tells the agent where its files go. */
const CONTEXT_BLOCK = "agentsStore";

const shelf = atom(
  { plugin: "notes", key: "shelf" } as const,
  { groups: [], place: "none", notice: null } as Shelf,
  { shape: "shelf-1" },
);
const view = atom(
  { plugin: "notes", key: "view" } as const,
  { focus: null, top: 0, reader: null, said: null } as View,
  { shape: "view-1" },
);
const band = atom({ plugin: "notes", key: "band" } as const, null as Band | null, {
  shape: "band-1",
});
const bandFocus = atom({ plugin: "notes", key: "bandFocus" } as const, null as string | null);
const paneShown = atom({ plugin: "notes", key: "paneShown" } as const, false);
const showAll = atom({ plugin: "notes", key: "showAll" } as const, false);
const keys = atom({ plugin: "notes", key: "keys" } as const, false, { shape: "keys-1" });

// ---- the session's checkouts

/** The session's start, then when the person last looked: notes written after it are news. */
let since = 0;
/**
 * The session's turns. The store is shared by every worktree, so only a note written during one
 * of these is this session's news.
 */
let turns: Turns = startTurns(0);
/** The link of each folder a session ran in: made once, a failed or busy one left alone for a while. */
const links = createLinks();
/** `<root>\0<state>` for each notice told: once a session for each. */
const told = new Set<string>();
/**
 * Whether the last `prompt.context` answer held the store's line; nothing before the first. That
 * answer stands for the conversation, so a change of it is asked for again.
 */
let contextSent: boolean | undefined;
let isMac: Promise<boolean> | undefined;

/** The engine as the lib's host: its processes, files and settings. */
function engineHost($: EngineInterface): Host {
  const run: Host["run"] = async (argv, o = {}) => {
    try {
      const r = await $.process.run(argv, {
        timeoutMs: o.timeoutMs ?? 30_000,
        ...(o.cwd ? { cwd: o.cwd } : {}),
      });
      return { exitCode: r.exitCode, stdout: r.stdout };
    } catch {
      return undefined;
    }
  };
  return {
    run,
    list: async (dir) =>
      (await $.fs.list(dir)).map((entry): Listed => ({
        name: entry.name,
        kind: entry.kind,
        mtimeMs: entry.mtimeMs,
      })),
    realPath: async (path) =>
      (await $.fs.stat(path, { resolve: true }).catch(() => undefined))?.realPath,
    size: async (path) => {
      const at = await $.fs.stat(path).catch(() => undefined);
      return at?.kind === "file" ? at.size : undefined;
    },
    read: (path) => $.fs.read(path),
    config: async () => {
      isMac ??= run(["uname", "-s"]).then((r) => r?.stdout.trim() === "Darwin");
      const platform: Platform = (await isMac) ? "mac" : "linux";
      const path = configPath({
        HOME: await $.env.get("HOME"),
        XDG_CONFIG_HOME: await $.env.get("XDG_CONFIG_HOME"),
      });
      const text =
        path && (await $.fs.exists(path).catch(() => false))
          ? await $.fs.read(path).catch(() => undefined)
          : undefined;
      return { text, platform };
    },
  };
}

/** Tells the person what a link that is not simply there means, once a session for each. */
function tell($: EngineInterface, cwd: string, ensured: Ensured) {
  const text = noticeText(ensured);
  const key = `${ensured.root ?? cwd}\0${ensured.state}`;
  if (!text || told.has(key)) return;
  try {
    $.ui.toast(`notes: ${text}`);
    // Only once it was shown.
    told.add(key);
  } catch {
    // Where no session is bound (a spawn), the list says it when it opens.
  }
}

/**
 * Links the checkout `cwd` is in to its store, once for each folder. A link that failed or was
 * busy is not asked about again for a while (`createLinks`); `fresh`, the person opening /notes,
 * asks at once. Never throws.
 */
function linkFolder($: EngineInterface, cwd: string, fresh = false): Promise<Ensured> {
  return links.get(cwd, {
    fresh,
    clock: () => $.clock.now(),
    ensure: async (folder) => {
      // Read now: a worktree made for the session can be linked before `session.start` ran.
      const stores = storeRoot({
        XDG_DATA_HOME: await $.env.get("XDG_DATA_HOME"),
        HOME: await $.env.get("HOME"),
      });
      const ensured = await ensureAt(engineHost($), folder, stores);
      tell($, folder, ensured);
      return ensured;
    },
  });
}

/**
 * The link of the folder the session runs in now. The line for the agent is answered once a
 * conversation, so when the folder gains or loses the shared store since it was answered, the
 * engine is asked for it again.
 */
async function linkHere($: EngineInterface, fresh = false): Promise<Ensured> {
  const ensured = await linkFolder($, await $.session.cwd(), fresh);
  if (contextSent !== undefined && contextSent !== isShared(ensured)) {
    contextSent = undefined;
    try {
      $.ui.invalidate("prompt.context");
    } catch {
      // Nothing is bound to ask yet; the first answer is not made either.
    }
  }
  return ensured;
}

/** Claude Code's memory of the project: the setting, else the folder named after the main checkout. */
async function memoryDir($: EngineInterface, ensured: Ensured) {
  return memoryDirOf({
    setting: await $.settings.read({ key: "autoMemoryDirectory" }).catch(() => undefined),
    configDir: await $.env.get("CLAUDE_CONFIG_DIR"),
    home: await $.env.get("HOME"),
    main: ensured.main,
  });
}

/**
 * The store's groups and the session's memory, walked now, into `shelf`; a reader on a note that
 * is no longer there is dropped.
 * @param ensured The link, when the hook has asked for it already: no second ask in one event.
 */
async function loadShelf($: EngineInterface, ensured?: Ensured): Promise<Shelf> {
  const linkedNow = ensured ?? (await linkHere($));
  const groups = await loadGroups(engineHost($), linkedNow, await memoryDir($, linkedNow));
  const next: Shelf = {
    groups,
    place: placeOf(linkedNow),
    notice: linkNotice(linkedNow) ?? null,
  };
  await update($, shelf, () => next);
  const reading = (await read($, view)).reader;
  if (reading && !isReaderLive(groups, reading))
    await update($, view, (v) => ({ ...v, reader: null }));
  return next;
}

/** Shows the band for this session's notes written since the person last looked, or takes it down. */
async function showBand($: EngineInterface, groups: Shelf["groups"]) {
  const next = bandOf(groups, since, (at) => duringTurns(turns, at)) ?? null;
  const now = await read($, band);
  if (next?.text !== now?.text || next?.newest !== now?.newest) await update($, band, () => next);
}

/** The person has looked: notes written so far are no news. */
async function looked($: EngineInterface) {
  since = await $.clock.now();
  await update($, band, () => null);
  await update($, bandFocus, () => null);
}

// ---- the pane

/** The width a pane is asked to open at, docked or inline; the surface caps it. */
const WANTED_COLUMNS = 80;

/** The pane as `$.ui.open` asks for it, the first time and when it takes the keyboard back. */
const openArgs = () =>
  paneOptions({
    id: PANE,
    title: TITLE,
    focus: true as const,
    closeOnEscape: true as const,
    // The terminal's screen fills the pane it is given, so an inline one asks for room.
    rows: 40,
    columns: WANTED_COLUMNS,
  });

/**
 * Takes the keyboard back for the pane after an Escape it refused to close on: the engine hands
 * the keys to the prompt either way, and opening the open pane with focus brings them back while
 * the prompt is empty.
 */
async function reclaim($: EngineInterface) {
  await $.ui.open(openArgs()).catch(() => undefined);
}

/** Opens /notes: the list, or with `id` the reader on that note. */
async function openPane($: EngineInterface, id?: string) {
  await looked($);
  // The person asks: a link that was left alone after a failure is asked about now.
  const { groups } = await loadShelf($, await linkHere($, true));
  const first = notesOf(groups)[0]?.id ?? null;
  // A note that is no longer on the shelf (the band's, a moment ago) is the list.
  const wanted = id ? notesOf(groups).find((n) => n.id === id) : undefined;
  await update($, view, () => ({
    focus: wanted?.id ?? first,
    top: 0,
    reader: wanted ? { id: wanted.id, offset: 0 } : null,
    said: null,
  }));
  await update($, keys, () => false);
  await update($, showAll, () => false);
  // The band steps aside first, so the pane is placed against the layout it will keep.
  await update($, paneShown, () => true);
  const opened = await $.ui.open(openArgs());
  if (!opened.isPlaced) {
    await update($, paneShown, () => false);
    $.ui.toast(`The notes pane can't show yet: ${opened.reason}`);
    return;
  }
  if (wanted)
    await act($, { do: "loaded", id: wanted.id, body: await readBody(engineHost($), wanted) });
}

/** Where the pane was last drawn: the graphical surfaces keep their own pane and close. */
let paneSurface = "terminal";
/** The screen's size as last drawn, for a key or a wheel that comes between two draws. */
let drawnAt: ScreenOptions = { width: 80, height: 24, now: 0 };
let drawnScreen: ReturnType<typeof drawScreen> = { lines: [], zones: {} };
/** A hand-off is under way: a second press while it starts is dropped. */
let isHanding = false;

/** The screen's state from the atoms that hold it. */
async function screenState($: EngineInterface): Promise<ScreenState> {
  const s = await read($, shelf);
  const v = await read($, view);
  return {
    groups: s.groups,
    place: s.place,
    notice: s.notice ?? undefined,
    focus: v.focus ?? undefined,
    top: v.top,
    reader: v.reader ?? undefined,
    said: v.said ?? undefined,
  };
}

async function closeScreen($: EngineInterface) {
  await update($, paneShown, () => false);
  await update($, keys, () => false);
  await $.ui.close({ id: PANE });
}

/** What the reducer asks for besides a redraw: closing, reading a note, handing one off. */
async function carryOut($: EngineInterface, effect: Effect) {
  if (effect.do === "close") return closeScreen($);
  const host = engineHost($);
  if (effect.do === "read")
    return act($, { do: "loaded", id: effect.note.id, body: await readBody(host, effect.note) });
  if (isHanding) return;
  isHanding = true;
  try {
    const handed = await handNote(host, effect.note, effect.way);
    if ("problem" in handed) await act($, { do: "say", text: handed.problem });
    else $.ui.toast(`Opened ${effect.note.name} in ${handed.app}`);
  } finally {
    isHanding = false;
  }
}

/** A key or a click on the screen: the reducer's next state into the atoms, then its effect. */
async function act($: EngineInterface, intent: Intent | undefined) {
  if (!intent) return;
  const before = await screenState($);
  const { state, effect } = reduce(before, intent, { ...drawnAt, now: await $.clock.now() });
  await update($, view, () => ({
    focus: state.focus ?? null,
    top: state.top,
    reader: state.reader ?? null,
    said: state.said ?? null,
  }));
  if (effect) await carryOut($, effect);
}

/** A hotkey of the screen's, read against the state as it is when it lands. */
async function press($: EngineInterface, key: string) {
  await act($, keyIntent(key, await screenState($), drawnAt));
}

async function hold($: EngineInterface, held: boolean) {
  if ((await read($, keys)) !== held) await update($, keys, () => held);
}

/** The keys the screen binds besides Enter and the arrows: one lowercase letter each. */
const SCREEN_KEYS = ["j", "k", "o"] as const;
/**
 * Rows under the screen: the keyboard hint's. The ring, which draws nothing, is first in the
 * pane, where it takes no row of its own.
 */
const ROWS_UNDER = 1;

// ---- the band

/** The band's controls, in the order the keyboard steps through them. */
const BAND_ORDER = [BAND.read, BAND.dismiss] as const;

/** A press on the band: its way in reads the newest note, Dismiss takes it down. */
async function pressBand($: EngineInterface, hit: string) {
  const shown = await read($, band);
  if (!shown) return;
  if (hit === BAND.dismiss) return looked($);
  if (hit !== BAND.read) return;
  const note = notesOf((await read($, shelf)).groups).find((n) => n.id === shown.newest);
  // An HTML note is read in the browser, as Enter on its row does.
  if (note?.kind === "html") {
    await looked($);
    return carryOut($, { do: "hand", note, way: "browser" });
  }
  return openPane($, shown.newest);
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    const started = await next(e);
    since = await $.clock.now();
    turns = startTurns(since);
    contextSent = undefined;
    await $.command
      .register({
        name: "notes",
        description: "List and read the notes in this repository's store",
      })
      .catch((error) =>
        $.ui.log(`notes: /notes not registered: ${String(error)}`, { to: "debug" }),
      );
    await linkHere($).catch(() => undefined);
    return started;
  });

  // A worktree made for the session (EnterWorktree, --worktree) or for a subagent: linked as soon
  // as it is there, so what an agent writes in it lands in the store.
  on("vcs.isolate", async ($, e, next) => {
    const made = await next(e);
    // Maybe before `session.start`: the store's folder is read from the environment when linking.
    if ("path" in made && made.path) await linkFolder($, made.path).catch(() => undefined);
    return made;
  });

  // A subagent started in another folder.
  on("agent.spawn", async ($, e, next) => {
    const started = await next(e);
    if (e.cwd) {
      const cwd = e.cwd.startsWith("/") ? e.cwd : `${await $.session.cwd()}/${e.cwd}`;
      await linkFolder($, cwd).catch(() => undefined);
    }
    return started;
  });

  // The session may have moved since the last prompt: the new checkout is linked before the turn.
  on("prompt.submit", async ($, e, next) => {
    // A turn starts here: its notes are the session's.
    turns = beginTurn(turns, await $.clock.now());
    await linkHere($).catch(() => undefined);
    return next(e);
  });

  // Where the agent's files go, once a conversation, where `.agents/store` is the shared store
  // (not a tracked folder of the repository's own, which git keeps).
  on("prompt.context", async ($, e, next) => {
    const context = await next(e);
    const ensured = await $.session
      .cwd()
      .then((cwd) => linkFolder($, cwd))
      .catch(() => undefined);
    const isTold = ensured !== undefined && isShared(ensured);
    contextSent = isTold;
    if (!isTold) return context;
    return { ...context, blocks: [...context.blocks, { name: CONTEXT_BLOCK, text: CONTEXT }] };
  });

  // After a turn the store is walked again: notes written since the person last looked show
  // above the prompt, and an open list takes them in.
  on("turn.complete", async ($, e, next) => {
    const done = await next(e);
    // A subagent's hooks see its own folder: linked too, in case it moved. Once for the event.
    const ensured = await linkHere($).catch(() => undefined);
    if (e.agentId !== undefined) return done;
    turns = endTurn(turns, await $.clock.now(), since);
    const loaded = await loadShelf($, ensured).catch(() => undefined);
    if (loaded) await showBand($, loaded.groups);
    return done;
  });

  on("command.run", { command: "notes" }, async ($) => {
    await openPane($);
    return { text: "Opened the notes pane." };
  }).catch((_$, _e, next) => ({ text: `notes: ${String(next.error)}` }));

  // In the terminal, Escape or the close mark leaves the reader first, and closes the list. On a
  // graphical surface closing closes. An unload closes without asking.
  on("ui.close", { id: PANE }, async ($, e, next) => {
    // Only a reader on a note still on the shelf has anything to go back from: the screen shows
    // the list for one whose note is gone, and refusing the close there would only reopen it.
    const isReading = isReaderLive((await read($, shelf)).groups, (await read($, view)).reader);
    if (e.origin.kind !== "unload" && paneSurface === "terminal" && isReading) {
      await act($, { do: "escape" });
      // After the close is refused, once the engine has moved the keys to the prompt.
      $.clock.after(50, () => void reclaim($));
      return { value: undefined };
    }
    await update($, paneShown, () => false);
    await update($, keys, () => false);
    return next(e);
  });

  on("ui.focus", { requestId: PANE }, async ($, e, next) => {
    // The terminal's screen draws its own focus: the engine's ring stays parked on a button that
    // draws nothing, and its moves become the screen's (`ring` and `ringMove` in the kit).
    if (paneSurface !== "terminal") return next(e);
    const move = ringMove(e.element, isScreenHit);
    if (move && "hit" in move) await act($, { do: "focus", hit: move.hit });
    else if (move?.by) await act($, { do: "move", by: move.by });
    const moved = await next(move ? { ...e, element: RING.park } : e);
    if (!moved.deny) await hold($, true);
    return moved;
  }).catch((_$, e, next) => next(e));

  // The band draws its own focus too: Tab and the arrows step between its way in and Dismiss.
  on("ui.focus", { component: "AbovePrompt" }, async ($, e, next) => {
    const move = ringMove(e.element, (hit) => (BAND_ORDER as readonly string[]).includes(hit));
    const held = await read($, bandFocus);
    let target: string | undefined;
    if (move && "hit" in move) target = move.hit;
    else if (move?.by) {
      const at = BAND_ORDER.indexOf((held ?? "") as (typeof BAND_ORDER)[number]);
      const from = at < 0 ? (move.by > 0 ? -1 : 0) : at;
      target = BAND_ORDER[(from + move.by + BAND_ORDER.length) % BAND_ORDER.length];
    } else if (!move && e.element === RING.park) target = held ?? BAND.read;
    if (target !== undefined && target !== held) await update($, bandFocus, () => target ?? null);
    return next(move ? { ...e, element: RING.park } : e);
  }).catch((_$, e, next) => next(e));

  // The wheel over the list moves its window, over the reader its text; the page keys move
  // those. The screen fits its pane, so the engine has nothing to move.
  on("ui.scroll", { requestId: PANE }, async ($, e, next) => {
    if (paneSurface !== "terminal") return next(e);
    const isReading = (await read($, view)).reader !== null;
    const zone = e.pointer
      ? zoneAt(drawnScreen.zones, e.pointer.row)
      : isReading
        ? "reader"
        : "list";
    const by = e.pointer ? WHEEL_ROWS * Math.sign(e.by) : e.by;
    if (zone) await act($, { do: "scroll", zone, by });
    return {};
  }).catch((_$, e, next) => next(e));

  // What the person types goes to the prompt, which then has the keyboard.
  on("prompt.edit", async ($, e, next) => {
    await hold($, false);
    if (await read($, bandFocus)) await update($, bandFocus, () => null);
    return next(e);
  });
  on("prompt.change", async ($, e, next) => {
    if (e.origin.kind !== "plugin") {
      await hold($, false);
      if (await read($, bandFocus)) await update($, bandFocus, () => null);
    }
    return next(e);
  });

  // Notes written since the person last looked, above the prompt; a survey has the band to itself.
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const below = await next(e);
    const shown = await read($, band);
    if (!shown || (await read($, paneShown))) return below;
    const els = $.ui.resolve(e);
    const pressed = (hit: string) => pressBand($, hit);
    return forSurface(e, {
      tui: async () => {
        const focus = await read($, bandFocus);
        const width = e.props.bodyColumns;
        return stack(
          els,
          below as JSX.Element,
          // First of the band's own, so the ring keeps its place whatever the line draws.
          ring(els, () => pressed(focus ?? BAND.read)),
          paintLines(
            els,
            [bandLine({ text: shown.text, hint: "read", width, hover: focus ?? undefined })],
            { press: pressed, width },
          ),
        );
      },
      gui: async () => stack(els, below as JSX.Element, notesBand(guiOf(els, e, pressed), shown)),
    });
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    paneSurface = e.surface;
    const els = $.ui.resolve(e);
    const now = await $.clock.now();
    return forSurface(e, {
      tui: async () => {
        // A docked pane keeps a cell from the engine's divider; an inline one has its box's.
        const pad = e.props.placement === "inline" ? 0 : 1;
        const width = Math.max(20, e.props.bodyColumns - pad);
        drawnAt = { width, height: Math.max(4, e.props.scroll.bodyRows - ROWS_UNDER), now };
        drawnScreen = drawScreen(await screenState($), drawnAt);
        const held = await read($, keys);
        return stack(
          els,
          // First, so the engine keeps its ring on it whatever rows come and go.
          ring(
            els,
            () => act($, { do: "main" }),
            SCREEN_KEYS.map((key) => ({ key, press: () => press($, key) })),
          ),
          paintLines(els, drawnScreen.lines, {
            press: (hit) => act($, { do: "press", hit }),
            width,
            indent: pad,
          }),
          // Always a row, so the frame keeps its place; set in to the screen's left edge.
          keysHint(els, held, false, pad + captionFrameLayout.x) ??
            paintLines(els, [blank()], { indent: pad }),
        );
      },
      gui: async () => {
        const s = await screenState($);
        const g = guiOf(els, e, async (hit) => {
          if (hit === MORE) await update($, showAll, () => true);
          else await act($, { do: "press", hit });
        });
        return notesPane(g, {
          groups: s.groups,
          place: s.place,
          notice: s.notice,
          reader: s.reader,
          said: s.said,
          isAll: await read($, showAll),
          now,
        });
      },
    });
  });
};
