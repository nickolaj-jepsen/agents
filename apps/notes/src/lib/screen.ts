/**
 * /notes' terminal screen, drawn once for pi and Claude Code's terminal: the store's notes under
 * the folder each is in, the reader that shows one note in a window that scrolls, and the buttons
 * on the last row. A pure function from the state, the width and the height to styled lines, each
 * control with its `hit`, and the reducer the keys and clicks of both clients go through. The
 * line above the prompt for notes written since the person last looked is here too.
 *
 * It imports the kit packages, which the build bundles into the mod and the pi extension.
 */
import { statusBand } from "@agents/kit-band/terminal.ts";
import type { Button } from "@agents/kit-buttons/contract.ts";
import { buttonRow } from "@agents/kit-buttons/terminal.ts";
import {
  blank,
  block,
  cellWidth,
  clamp,
  hitSpans,
  line,
  scrolled,
  span,
  spansWidth,
  type Line,
  type Span,
} from "@agents/kit-core/lines.ts";
import { tokens } from "@agents/kit-core/tokens.ts";
import { captionFrameLayout, closeOf } from "@agents/kit-frame/contract.ts";
import { captionParts, captionRule, frameTop } from "@agents/kit-frame/terminal.ts";
import type { List, ListGroup } from "@agents/kit-list/contract.ts";
import { cutLeft, list, listFollow, listTextRoom, listTopMax } from "@agents/kit-list/terminal.ts";
import { emptyState, notice } from "@agents/kit-notice/terminal.ts";
import { prose } from "@agents/kit-prose/terminal.ts";
import {
  age,
  artefactsLabel,
  LOOSE,
  notesOf,
  written,
  writtenLabel,
  type Group,
  type Note,
} from "./shelf.ts";
import type { Way } from "./hand.ts";

export const TITLE = "Notes";

/** Whether the folder has a store: it does, it is in no repository, or the store could not be set up. */
export type Place = "store" | "outside" | "none";

/** What the reader shows of a note: its text, or why it is not read here. */
export type Body = { text: string } | { problem: string };

export type Reader = {
  /** The note that is read. */
  id: string;
  /** Rows the window is scrolled. */
  offset: number;
  /** Nothing while the file is being read. */
  body?: Body;
};

export type ScreenState = {
  /** The store's groups in the order they are listed, the harness's memory last. */
  groups: readonly Group[];
  place: Place;
  /** What the link's state has to say (`noticeOf`), over the list. */
  notice?: string;
  /** The note the keyboard is on. */
  focus?: string;
  /** The list window's first line: it moves when the keyboard would leave it, or by the wheel. */
  top: number;
  /** The reader, while a note is read. */
  reader?: Reader;
  /** What the last action has to say, such as that no app can open a file. */
  said?: string;
  /** The control under the mouse, where the client reports it. */
  hover?: string;
};

export type ScreenOptions = {
  width: number;
  height: number;
  /** Now, in ms: how old a note is. */
  now: number;
};

/** Rows of the screen the wheel scrolls, by the zone it is over: `[from, to)`. */
export type Zones = { list?: [number, number]; reader?: [number, number] };

export type Drawn = { lines: Line[]; zones: Zones };

/** What the client does after a key or click, besides drawing again. */
export type Effect =
  | { do: "close" }
  /** Read the note's file and answer with `loaded`. */
  | { do: "read"; note: Note }
  /** Hand the note to an app, or an HTML note to the browser. */
  | { do: "hand"; note: Note; way: Way };

export type Intent =
  | { do: "move"; by: number }
  | { do: "main" }
  | { do: "open" }
  | { do: "back" }
  | { do: "close" }
  | { do: "escape" }
  | { do: "scroll"; zone: "list" | "reader"; by: number }
  /** A click on a control. */
  | { do: "press"; hit: string }
  /** The keyboard put on a control without pressing it: Claude Code's ring moved there. */
  | { do: "focus"; hit: string }
  | { do: "hover"; hit?: string }
  /** The file of the note the reader is on was read. */
  | { do: "loaded"; id: string; body: Body }
  | { do: "say"; text?: string };

export const startState = (
  groups: readonly Group[],
  place: Place = "store",
  noticed?: string,
): ScreenState => ({
  groups,
  place,
  notice: noticed,
  focus: notesOf(groups)[0]?.id,
  top: 0,
});

/** The state with the reader on `id`, as the band's way in opens it. */
export const readingState = (s: ScreenState, id: string): ScreenState => ({
  ...s,
  focus: id,
  reader: { id, offset: 0 },
  said: undefined,
});

// ---- controls

export const rowHit = (id: string) => `row:${id}`;
export const BUTTONS = { main: "main", open: "open", back: "back" } as const;

const idOf = (hit: string, prefix: string) =>
  hit.startsWith(prefix) ? hit.slice(prefix.length) : undefined;

// ---- what the state says

const focused = (s: ScreenState): Note | undefined => {
  const notes = notesOf(s.groups);
  return notes.find((n) => n.id === s.focus) ?? notes[0];
};

/** The note the reader is on; none once it is gone from the store. */
const reading = (s: ScreenState): Note | undefined =>
  s.reader ? notesOf(s.groups).find((n) => n.id === s.reader?.id) : undefined;

const groupOf = (s: ScreenState, note: Note) =>
  s.groups.find((g) => g.notes.some((n) => n.id === note.id));

/** A note's path as it is read: under its group's folder, or bare for one in no folder. */
export function pathOf(groups: readonly Group[], note: Note): string {
  const group = groups.find((g) => g.notes.some((n) => n.id === note.id));
  return group && group.label !== LOOSE ? `${group.label}/${note.name}` : note.name;
}

/** `12 notes`, `1 note`. */
export const countLabel = (count: number) => (count === 1 ? "1 note" : `${count} notes`);

/** What the screen says in place of rows, by where the folder stands. */
export const emptyText = (place: Place): string | undefined =>
  place === "store"
    ? "No notes yet. What an agent writes under .agents/store shows up here."
    : place === "outside"
      ? "This folder is in no git repository, so it has no store."
      : undefined;

/** The main action on a note: an HTML note goes to the browser, any other is read here. */
const mainLabel = (note: Note | undefined) => (note?.kind === "html" ? "Open in browser" : "Read");

/**
 * The folders' other files in one sentence, `2 artefacts in plans and 1 in screens.`: what a
 * graphical surface says under the list, whose group headings take no count.
 */
export function artefactsText(groups: readonly Group[]): string | undefined {
  const parts = groups
    .filter((g) => g.artefacts > 0)
    .map((g, i) => `${i === 0 ? artefactsLabel(g.artefacts) : g.artefacts} in ${g.label}`);
  if (parts.length === 0) return undefined;
  const last = parts.pop() as string;
  return `${parts.length ? `${parts.join(", ")} and ${last}` : last}.`;
}

// ---- the layout

/** Cells the text is set in by on both sides: where the caption rule has its words. */
const X = captionFrameLayout.x;
/** The age's column at the right of every row: `now`, `59m`, `365d`. */
const ASIDE = 4;
/** Below this many rows the frame drops its blank row and a title its second. */
const SHORT = 20;
/** Below this many rows the list is all there is: Claude Code's pane above the prompt of a 24-row terminal. */
const TINY = 9;
/** Rows a note's name may take in the list. */
const NAME_ROWS = 2;
/** Rows the notice takes over the list at most, on a tall screen and on a short one. */
const NOTICE_ROWS = 4;
const SHORT_NOTICE_ROWS = 3;
/** Cells of ` › ` between a flat row's folder and its name. */
const FLAT_SEPARATOR = 3;

type Mode = "tiny" | "short" | "tall";

type Frame = {
  mode: Mode;
  /** Cells of a row of text, between the two edges. */
  inner: number;
  /** Rows before the body: the caption, and a tall screen's blank row. */
  head: number;
  /** Rows between the head and the rule over the buttons. */
  body: number;
};

function frameOf(o: ScreenOptions): Frame {
  const mode: Mode = o.height < TINY ? "tiny" : o.height < SHORT ? "short" : "tall";
  const head = mode === "tall" ? 2 : 1;
  // The buttons, and the rule over them where there is room for one.
  const foot = mode === "tiny" ? 1 : 2;
  return {
    mode,
    inner: Math.max(1, o.width - 2 * X),
    head,
    body: Math.max(1, o.height - head - foot),
  };
}

/** A row set in to where the text starts: the caption's words, the names, the buttons. */
const inset = (l: Line): Line =>
  l.spans.length ? { ...l, spans: [span(" ".repeat(X)), ...l.spans] } : l;

const padTo = (rows: Line[], n: number) => [
  ...rows.slice(0, Math.max(0, n)),
  ...Array.from({ length: Math.max(0, n - rows.length) }, blank),
];

const rule = (width: number) => captionRule({ width });

/** The link's notice over the list, a blank row under it; a pane of a few rows has no room for it. */
function noticeRows(s: ScreenState, f: Frame): Line[] {
  if (!s.notice || f.mode === "tiny") return [];
  // Wrapped to the rows it may take, the last cut with `…`: each row is the kit's notice.
  const max = f.mode === "tall" ? NOTICE_ROWS : SHORT_NOTICE_ROWS;
  const rows = clamp(s.notice, f.inner, { max }).flatMap((row) =>
    notice({ text: row, width: f.inner, status: "warning" }),
  );
  return [...rows, blank()];
}

/** What the last action said, on the row over the buttons' rule. */
const saidRows = (s: ScreenState, f: Frame): Line[] =>
  s.said ? notice({ text: s.said, width: f.inner, status: "warning" }) : [];

/** The list's own numbers: the age column, no marks' rails, a blank row between folders. */
const ROWS = { aside: ASIDE, rail: false, space: true } as const;

/** The notes as the kit's list, in `height` rows: whole without. */
function listOf(s: ScreenState, o: ScreenOptions, f: Frame, height?: number): List {
  const at = focused(s);
  const lines = f.mode === "tiny" ? 1 : NAME_ROWS;
  const shape = { ...ROWS, lines, flat: f.mode === "tiny" };
  // A row's room, by the cells this list's rows keep before their text.
  const like: ListGroup[] = [{ label: "", rows: [{ text: "", mark: "none" }] }];
  const room = listTextRoom(f.inner, { ...shape, groups: like });
  const groups: ListGroup[] = s.groups.map((g) => {
    const count = artefactsLabel(g.artefacts);
    // A flat row starts with its folder, `plans › `, cut to a third of the row at most.
    const label = shape.flat
      ? Math.min(cellWidth(g.label), Math.max(4, Math.floor(room / 3))) + FLAT_SEPARATOR
      : 0;
    return {
      label: g.label,
      active: g.notes.some((n) => n.id === at?.id),
      // Not a control: the folder's other files, a dim hint at the row's right edge.
      actions: count ? [{ label: count, hotkey: "" }] : undefined,
      rows: g.notes.map((n) => ({
        // A path is read from its end: a name too long for its rows loses its first folders.
        text: cutLeft(n.name, Math.max(8, lines * (room - label) - lines)),
        literal: true,
        mark: "none" as const,
        aside: age(o.now - n.at),
        focused: n.id === at?.id,
        hovered: s.hover === rowHit(n.id),
        hit: rowHit(n.id),
      })),
    };
  });
  return { groups, height, top: s.top, ...shape };
}

/** Rows the list has on a screen of `o`: what the caption, the notice and the buttons leave. */
const listRoom = (s: ScreenState, f: Frame) =>
  Math.max(1, f.body - noticeRows(s, f).length - saidRows(s, f).length);

function footer(s: ScreenState, f: Frame, keys: Button[]): Line {
  const hovered = keys.map((k) => ({ ...k, hovered: k.hit !== undefined && k.hit === s.hover }));
  return inset(buttonRow(hovered, f.inner)[0] ?? line([]));
}

const close = (s: ScreenState) => ({ hover: closeOf(s.hover) });

/** `Notes ── 12 notes` where both fit, else the title. */
function caption(s: ScreenState, room: number): Span[] {
  const title = span(TITLE, { role: "accent", bold: true });
  const count = notesOf(s.groups).length;
  const both = captionParts([[title], count ? [span(countLabel(count), { role: "dim" })] : []]);
  return spansWidth(both) <= room ? both : [title];
}

/** The screen with no note to list: the caption, the notice, and why there are no rows. */
function drawEmpty(s: ScreenState, o: ScreenOptions, f: Frame): Drawn {
  const said = emptyText(s.place);
  const rows = [
    ...noticeRows(s, f),
    ...(said ? emptyState({ text: said, width: f.inner }) : []),
    // Folders that hold only artefacts still stand, each with its count.
    ...(s.groups.length ? [blank(), ...list(listOf(s, o, f), f.inner)] : []),
  ];
  while (rows.length && !rows[rows.length - 1]?.spans.length) rows.pop();
  return {
    lines: [
      frameTop({ width: o.width, title: TITLE, close: close(s) }),
      ...(f.mode === "tall" ? [blank()] : []),
      ...rows.map(inset),
    ].slice(0, Math.max(2, o.height)),
    zones: {},
  };
}

function drawList(s: ScreenState, o: ScreenOptions, f: Frame): Drawn {
  const over = noticeRows(s, f);
  const said = saidRows(s, f);
  const room = listRoom(s, f);
  const rows = list(listOf(s, o, f, room), f.inner);
  const at = focused(s);
  const keys: Button[] = [
    { hotkey: "enter", label: mainLabel(at), hit: BUTTONS.main, essential: true },
    { hotkey: "o", label: "Open", hit: BUTTONS.open, essential: true },
  ];
  return {
    lines: [
      frameTop({
        width: o.width,
        title: TITLE,
        caption: (width) => caption(s, width),
        close: close(s),
      }),
      ...(f.mode === "tall" ? [blank()] : []),
      ...[...over, ...padTo(rows, room), ...said].map(inset),
      ...(f.mode === "tiny" ? [] : [rule(o.width)]),
      footer(s, f, keys),
    ],
    zones: { list: [f.head + over.length, f.head + over.length + room] },
  };
}

/** The last text set as prose and the width it was set at: a scroll draws the same lines again. */
let set: { text: string; width: number; lines: Line[] } | undefined;

function proseLines(text: string, width: number): Line[] {
  if (set?.text !== text || set.width !== width)
    set = { text, width, lines: prose({ text, width }) };
  return set.lines;
}

/** Every row of what the reader shows of its note, uncut. */
function bodyLines(reader: Reader, f: Frame): Line[] {
  const { body } = reader;
  if (!body) return [line([span("Reading…", { role: "dim" })])];
  if ("problem" in body)
    return notice({ text: body.problem, width: f.inner, status: "warning", isWrapped: true });
  if (!body.text.trim()) return [line([span("This note is empty.", { role: "dim" })])];
  return proseLines(body.text, Math.min(f.inner, tokens.prose));
}

/** The reader's rows over its window: the note's path, and a rule with its folder and age. */
function readerHead(s: ScreenState, note: Note, o: ScreenOptions, f: Frame): Line[] {
  if (f.mode === "tiny") return [];
  const path = pathOf(s.groups, note);
  const rows = f.mode === "tall" ? 2 : 1;
  const title = block(
    [span(cutLeft(path, Math.max(8, rows * f.inner - rows)), { role: "text", bold: true })],
    f.inner,
    { max: rows },
  ).map(inset);
  const group = groupOf(s, note);
  const meta = captionParts(
    [group?.label ?? "", age(o.now - note.at)]
      .filter(Boolean)
      .map((part) => [span(part, { role: "dim" })]),
  );
  return [...title, captionRule({ width: o.width, caption: meta })];
}

/** The reader's window: the rows it has and how far it scrolls. */
function readerWindow(s: ScreenState, note: Note, o: ScreenOptions, f: Frame) {
  const reader = s.reader as Reader;
  const head = readerHead(s, note, o, f);
  const said = saidRows(s, f);
  const rows = Math.max(1, f.body - head.length - said.length);
  const window = scrolled(bodyLines(reader, f).map(inset), {
    rows,
    top: reader.offset,
    inset: X,
  });
  return { head, said, rows, window };
}

function drawReader(s: ScreenState, note: Note, o: ScreenOptions, f: Frame): Drawn {
  const { head, said, rows, window } = readerWindow(s, note, o, f);
  const isRefused = s.reader?.body !== undefined && "problem" in s.reader.body;
  const keys: Button[] = [
    { hotkey: "enter", label: "Back", hit: BUTTONS.back, essential: true },
    // A note that is not read here has one thing left to do with it.
    { hotkey: "o", label: "Open", hit: BUTTONS.open, essential: true, isLit: isRefused },
  ];
  const path = pathOf(s.groups, note);
  const old = age(o.now - note.at);
  // A pane of a few rows has no row for the path: it is the caption.
  const top =
    f.mode === "tiny"
      ? frameTop({
          width: o.width,
          title: TITLE,
          caption: (width) =>
            captionParts([
              [
                span(cutLeft(path, Math.max(4, width - cellWidth(old) - tokens.gutter - 2)), {
                  role: "accent",
                  bold: true,
                }),
              ],
              [span(old, { role: "dim" })],
            ]),
          close: close(s),
        })
      : frameTop({
          width: o.width,
          title: TITLE,
          caption: (width) => caption(s, width),
          close: close(s),
        });
  const from = f.head + head.length;
  return {
    lines: [
      top,
      ...(f.mode === "tall" ? [blank()] : []),
      ...head,
      ...padTo(window.rows, rows),
      ...said.map(inset),
      ...(f.mode === "tiny" ? [] : [rule(o.width)]),
      footer(s, f, keys),
    ],
    zones: { reader: [from, from + rows] },
  };
}

/**
 * The screen at `width` by `height` cells: every row at most `width` cells. The buttons are its
 * last row: what is under it, a prompt or the window's edge, closes it.
 */
export function drawScreen(s: ScreenState, o: ScreenOptions): Drawn {
  const f = frameOf(o);
  const note = reading(s);
  if (note) return drawReader(s, note, o, f);
  if (notesOf(s.groups).length === 0) return drawEmpty(s, o, f);
  return drawList(s, o, f);
}

// ---- the reducer

/** `s` with the keyboard on `id`; the list's window stays where it is. */
const focusOn = (s: ScreenState, id: string | undefined): ScreenState =>
  id === undefined || id === s.focus ? s : { ...s, focus: id };

/** The list's window moved as little as keeps the keyboard's row in it, two rows round it. */
function follow(s: ScreenState, o: ScreenOptions): ScreenState {
  const f = frameOf(o);
  return { ...s, top: listFollow(listOf(s, o, f, listRoom(s, f)), f.inner) };
}

function scrollZone(s: ScreenState, o: ScreenOptions, zone: "list" | "reader", by: number) {
  const f = frameOf(o);
  const note = reading(s);
  if (zone === "reader") {
    if (!note || !s.reader) return s;
    const { max, top } = readerWindow(s, note, o, f).window;
    return { ...s, reader: { ...s.reader, offset: Math.max(0, Math.min(max, top + by)) } };
  }
  if (note) return s;
  const max = listTopMax(listOf(s, o, f, listRoom(s, f)), f.inner);
  return { ...s, top: Math.max(0, Math.min(max, s.top + by)) };
}

const done = (state: ScreenState, effect?: Effect) => ({ state, effect });

/** What a key or click does: the next state, and what the client does besides drawing. */
export function reduce(
  s: ScreenState,
  intent: Intent,
  o: ScreenOptions,
): { state: ScreenState; effect?: Effect } {
  if (intent.do === "hover") return done({ ...s, hover: intent.hit });
  if (intent.do === "say") return done({ ...s, said: intent.text });
  if (intent.do === "loaded")
    return done(
      s.reader?.id === intent.id ? { ...s, reader: { ...s.reader, body: intent.body } } : s,
    );
  const note = reading(s);
  const at = note ?? focused(s);
  // A reader whose note is gone is the list again.
  const here: ScreenState = note || !s.reader ? s : { ...s, reader: undefined };
  const quiet: ScreenState = here.said === undefined ? here : { ...here, said: undefined };
  switch (intent.do) {
    case "move": {
      if (note) return done(scrollZone(quiet, o, "reader", intent.by));
      const ids = notesOf(s.groups).map((n) => n.id);
      const from = ids.indexOf(at?.id ?? "");
      const to = ids[Math.max(0, Math.min(ids.length - 1, from + intent.by))];
      return done(follow(focusOn(quiet, to), o));
    }
    case "scroll":
      return done(scrollZone(here, o, intent.zone, intent.by));
    case "main":
      if (note) return reduce(s, { do: "back" }, o);
      if (!at) return done(here, { do: "close" });
      if (at.kind === "html") return done(quiet, { do: "hand", note: at, way: "browser" });
      return done(readingState(quiet, at.id), { do: "read", note: at });
    case "open":
      return at ? done(quiet, { do: "hand", note: at, way: "app" }) : done(here);
    case "back":
      return done(follow({ ...quiet, reader: undefined }, o));
    case "close":
      return done(here, { do: "close" });
    case "escape":
      return note ? reduce(s, { do: "back" }, o) : done(here, { do: "close" });
    case "focus":
    case "press": {
      const { hit } = intent;
      const row = idOf(hit, "row:");
      if (row !== undefined) {
        // A click puts the keyboard where it lands; the window stays under the pointer.
        if (intent.do === "focus") return done(focusOn(here, row));
        // A press is the row's own main action, whatever is read now.
        const there = focusOn({ ...quiet, reader: undefined }, row);
        const target = notesOf(s.groups).find((n) => n.id === row);
        if (!target) return done(here);
        if (target.kind === "html")
          return done(there, { do: "hand", note: target, way: "browser" });
        return done(readingState(there, target.id), { do: "read", note: target });
      }
      if (intent.do === "focus") return done(here);
      const action: Record<string, Intent> = {
        [BUTTONS.main]: { do: "main" },
        [BUTTONS.open]: { do: "open" },
        [BUTTONS.back]: { do: "back" },
        "frame:close": { do: "close" },
      };
      const next = action[hit];
      return next ? reduce(s, next, o) : done(here);
    }
  }
}

/** A step the page keys take: a window less two rows, so a line stays in view. */
function page(s: ScreenState, o: ScreenOptions) {
  const f = frameOf(o);
  const note = reading(s);
  const rows = note ? readerWindow(s, note, o, f).rows : listRoom(s, f);
  return Math.max(1, rows - 2);
}

/**
 * What a key does, by name: `up`, `down`, `pageup`, `pagedown`, `enter`, `escape`, or the
 * character typed. `undefined` for a key the screen does not take.
 */
export function keyIntent(key: string, s: ScreenState, o: ScreenOptions): Intent | undefined {
  const zone = reading(s) ? "reader" : "list";
  switch (key) {
    case "up":
    case "k":
      return { do: "move", by: -1 };
    case "down":
    case "j":
      return { do: "move", by: 1 };
    case "pageup":
      return { do: "scroll", zone, by: -page(s, o) };
    case "pagedown":
      return { do: "scroll", zone, by: page(s, o) };
    case "enter":
      return { do: "main" };
    case "escape":
      return { do: "escape" };
    case "o":
      return { do: "open" };
  }
  return undefined;
}

/** The zone of the screen row `y`, for the wheel. */
export function zoneAt(zones: Zones, y: number): "list" | "reader" | undefined {
  if (zones.list && y >= zones.list[0] && y < zones.list[1]) return "list";
  if (zones.reader && y >= zones.reader[0] && y < zones.reader[1]) return "reader";
  return undefined;
}

/** Rows one notch of the wheel moves a zone. */
export const WHEEL_ROWS = 3;

/** Every control's `hit` the screen draws, for a client that asks whether one is its own. */
export const isScreenHit = (hit: string) =>
  /^(row|frame):/.test(hit) || (Object.values(BUTTONS) as string[]).includes(hit);

// ---- the line above the prompt

/** The band's controls: the line itself reads the newest note, and Dismiss clears it. */
export const BAND = { read: "notes:read", dismiss: "notes:dismiss" } as const;

/** What the band says, and the note its way in opens. */
export type Band = { text: string; newest: string };

/**
 * The band for the store's notes written since `since`, the newest named; nothing when none was.
 * Memory is the harness's own and never shows here.
 */
export function bandOf(groups: readonly Group[], since: number): Band | undefined {
  const notes = written(groups, since);
  const text = writtenLabel(notes, groups);
  return text && notes[0] ? { text, newest: notes[0].id } : undefined;
}

export type BandLine = {
  /** What was written (`writtenLabel`). */
  text: string;
  /** What a press on the line does, or the command that does it where the line has no keys. */
  hint: string;
  width: number;
  /** The control under the pointer, where the client reports it. */
  hover?: string;
};

/**
 * `✓ Note written: plans/retry.md read  Dismiss`: the kit's status band, which is the way in, and
 * Dismiss after it as a control of its own.
 */
export function bandLine({ text, hint, width, hover }: BandLine): Line {
  const dismiss =
    buttonRow(
      [{ hotkey: "", label: "Dismiss", hit: BAND.dismiss, hovered: hover === BAND.dismiss }],
      width,
    )[0]?.spans ?? [];
  const room = Math.max(1, width - spansWidth(dismiss) - tokens.gutter);
  const [way] = statusBand({
    text,
    hint,
    hit: BAND.read,
    status: "success",
    width: room,
    hovered: hover === BAND.read,
  });
  return line([
    ...hitSpans(way?.spans ?? [], BAND.read),
    span(" ".repeat(tokens.gutter)),
    ...dismiss,
  ]);
}
