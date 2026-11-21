/**
 * /docfix's terminal screen, drawn once for pi and Claude Code's terminal: the queue of
 * suggestions grouped by doc, the focused suggestion under it, the reader that shows one
 * suggestion with all its evidence, and the footer's buttons, in the kit's captioned frame. A
 * pure function from the state, the width and the height to styled lines, each control with its
 * `hit`, and the reducer the keys and clicks of both clients go through.
 *
 * It imports the kit from the mod's copy (`../claude/kit/`, written by `just kit-sync`): a Claude
 * Code mod cannot import outside its plugin, and pi reads the same files.
 */
import type { Button } from "../claude/kit/buttons/contract.ts";
import { buttonRow } from "../claude/kit/buttons/terminal.ts";
import type { Detail, DetailSection } from "../claude/kit/detail/contract.ts";
import { detail, detailRange } from "../claude/kit/detail/terminal.ts";
import { captionFrameLayout, closeOf } from "../claude/kit/frame/contract.ts";
import { captionFrame } from "../claude/kit/frame/terminal.ts";
import {
  blank,
  cellWidth,
  line,
  span,
  spansWidth,
  type Line,
  type Span,
} from "../claude/kit/lines.ts";
import type { List, ListGroup } from "../claude/kit/list/contract.ts";
import { list, LIST_INSET, listRange, listShowsWhole } from "../claude/kit/list/terminal.ts";
import { tokens } from "../claude/kit/tokens.ts";
import {
  byTarget,
  evidenceBlocks,
  readEvidence,
  repeats,
  seen,
  toggleChoice,
  type Choice,
  type Suggestion,
} from "./docfix.ts";

export const TITLE = "Doc suggestions";

export type ScreenState = {
  /** The open suggestions, in queue order (`openQueue`). */
  queue: readonly Suggestion[];
  /** What each row is set to; a row not in it is left alone. */
  set: Readonly<Record<string, Choice>>;
  /** How many are dismissed already, for the screen with nothing open. */
  dismissed: number;
  /** The suggestion the keyboard is on. */
  focus?: string;
  /** The reader is open on the focused suggestion, at this piece of evidence (0 the newest). */
  reader?: number;
  /** Rows the wheel moved the queue's window and the focused suggestion (or the reader). */
  scroll: { list: number; detail: number };
  /** Close asks before it throws away what is set. */
  confirming?: boolean;
  /** The control under the mouse, where the client reports it. */
  hover?: string;
  /** Why the main action could not be carried out, in the error colour. */
  notice?: string;
};

export type ScreenOptions = {
  width: number;
  height: number;
  /** Now, in ms: how old a suggestion is. */
  now: number;
  /**
   * The client binds Shift+A and Shift+D apart from a and d, so whole doc has keys. Claude Code's
   * hotkeys are one lowercase letter (Shift+a is a), so it has none there.
   */
  wholeDoc?: boolean;
};

/** Rows of the screen the wheel scrolls, by the zone it is over: `[from, to)`. */
export type Zones = { list?: [number, number]; detail?: [number, number] };

export type Drawn = { lines: Line[]; zones: Zones };

/** What the client does after a key or click, besides drawing again. */
export type Effect =
  /** Close, carrying nothing out. */
  | "close"
  /** Carry out what is set: dismiss the dismissed, draft a prompt for the applied, then close. */
  | "submit";

export type Intent =
  | { do: "move"; by: number }
  | { do: "set"; choice: Choice }
  | { do: "doc"; choice: Choice }
  | { do: "reader" }
  | { do: "back" }
  | { do: "next" }
  | { do: "scroll"; zone: "list" | "detail"; by: number }
  | { do: "main" }
  | { do: "close" }
  | { do: "escape" }
  /** A click on a control. */
  | { do: "press"; hit: string }
  /** The keyboard put on a control without pressing it: Claude Code's ring moved there. */
  | { do: "focus"; hit: string }
  | { do: "hover"; hit?: string };

export const startState = (queue: readonly Suggestion[], dismissed = 0): ScreenState => ({
  queue,
  set: {},
  dismissed,
  focus: queue[0]?.id,
  scroll: { list: 0, detail: 0 },
});

// ---- controls

export const rowHit = (id: string) => `row:${id}`;
export const docHit = (target: string) => `doc:${target}`;
export const DETAIL = "detail";
export const BUTTONS = {
  main: "main",
  apply: "apply",
  dismiss: "dismiss",
  evidence: "evidence",
  back: "back",
  next: "next",
} as const;

const idOf = (hit: string, prefix: string) =>
  hit.startsWith(prefix) ? hit.slice(prefix.length) : undefined;

// ---- what the state says

const focused = (s: ScreenState) => s.queue.find((q) => q.id === s.focus) ?? s.queue[0];

const isAnySet = (s: ScreenState) => s.queue.some((q) => s.set[q.id]);

const counts = (s: ScreenState) => {
  let apply = 0;
  let dismiss = 0;
  for (const q of s.queue)
    if (s.set[q.id] === "apply") apply++;
    else if (s.set[q.id] === "dismiss") dismiss++;
  return { apply, dismiss };
};

const DAY = 86_400_000;

/** `today`, `yesterday`, `3 days ago`, `2 months ago`. */
export function ageText(iso: string, now: number): string {
  const days = Math.floor((now - Date.parse(iso)) / DAY);
  if (!Number.isFinite(days) || days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

/** `wrong · seen 3× · 2 days ago`: the kind in a word, how often, how long ago. */
export const metaText = (q: Suggestion, now: number) =>
  `${q.kind} · seen ${seen(q) > 1 ? `${seen(q)}×` : "once"} · ${ageText(q.updated, now)}`;

/** The main action's words, longest first: what it will do. */
function mainLabels(s: ScreenState): string[] {
  const { apply, dismiss } = counts(s);
  const fixes = `${apply} ${apply === 1 ? "fix" : "fixes"}`;
  if (apply && dismiss)
    return [
      `Draft ${fixes}, dismiss ${dismiss}`,
      `Draft ${apply}, dismiss ${dismiss}`,
      `Carry out ${apply + dismiss}`,
    ];
  if (apply) return [`Draft ${fixes}`, `Draft ${apply}`];
  if (dismiss) return [`Dismiss ${dismiss}`];
  return ["Close"];
}

// ---- the layout

const EDGE = LIST_INSET;
const RIGHT = captionFrameLayout.x;
/** The screen counts as short below this many rows: the evidence is in the reader alone. */
const SHORT = 30;
/**
 * Below this many rows the frame drops its blank row and its notice row, and the queue is all
 * there is: Claude Code's pane above the prompt of a 24-row terminal has six.
 */
const TINY = 12;

type Layout = {
  body: number;
  isShort: boolean;
  isTiny: boolean;
  /** Rows of the queue and of the focused suggestion under it, a blank row between. */
  list: number;
  detail: number;
  listWidth: number;
  innerWidth: number;
};

function layout(s: ScreenState, o: ScreenOptions): Layout {
  const isTiny = o.height < TINY;
  const body = Math.max(1, o.height - (isTiny ? 3 : captionFrameLayout.chrome));
  const isShort = o.height < SHORT;
  if (isTiny)
    return {
      body,
      isShort,
      isTiny,
      list: body,
      detail: 0,
      listWidth: o.width - RIGHT,
      innerWidth: Math.max(1, o.width - EDGE - RIGHT),
    };
  const natural = byTarget(s.queue).reduce((n, [, rows]) => n + 1 + rows.length, 0);
  const least = isShort ? 4 : Math.max(8, Math.floor(body * 0.4));
  const room = body - 1 - least;
  const rows = natural <= room ? natural : Math.max(Math.min(natural, 3), room);
  const listRows = Math.max(1, Math.min(rows, body - 2));
  return {
    body,
    isShort,
    isTiny,
    list: listRows,
    detail: Math.max(0, body - listRows - 1),
    listWidth: o.width - RIGHT,
    innerWidth: Math.max(1, o.width - EDGE - RIGHT),
  };
}

function listOf(s: ScreenState, l: Layout): List {
  const at = focused(s);
  const groups: ListGroup[] = byTarget(s.queue).map(([target, rows]) => ({
    label: target,
    count: String(rows.length),
    active: rows.some((q) => q.id === at?.id),
    done: rows.every((q) => s.set[q.id]),
    hit: docHit(target),
    rows: rows.map((q) => ({
      text: q.claim,
      mark: s.set[q.id] === "apply" ? "chosen" : s.set[q.id] === "dismiss" ? "dropped" : "open",
      aside: repeats(q),
      focused: q.id === at?.id,
      hovered: s.hover === rowHit(q.id),
      hit: rowHit(q.id),
    })),
  }));
  return { groups, height: l.list, scroll: s.scroll.list, noun: ["doc", "docs"] };
}

/** The newest piece of evidence, or the reader's, as sections in the order the core gives. */
function evidenceSections(q: Suggestion, piece: number): DetailSection[] {
  const pieces = [...q.evidence].reverse();
  const e = pieces[piece];
  if (!e) return [];
  return evidenceBlocks(readEvidence(e)).map((b) => ({
    heading: b.heading || undefined,
    text: b.lines.join("\n") || undefined,
    items: b.items?.map((c) => ({ key: c.kind, value: c.value, isQuote: c.kind === "quote" })),
  }));
}

/** The focused suggestion under the queue: its meta line, its claim, its newest evidence. */
function focusedDetail(s: ScreenState, o: ScreenOptions, l: Layout): Detail | undefined {
  const q = focused(s);
  if (!q) return undefined;
  return {
    meta: metaText(q, o.now),
    title: listShowsWhole(q.claim, l.listWidth, repeats(q)) ? undefined : q.claim,
    sections: l.isShort ? [] : evidenceSections(q, 0),
    height: l.detail,
    offset: s.scroll.detail,
    hit: DETAIL,
    hovered: s.hover === DETAIL,
  };
}

/** The reader: the focused suggestion whole, with one piece of evidence at a time. */
function readerDetail(s: ScreenState, o: ScreenOptions, l: Layout): Detail | undefined {
  const q = focused(s);
  if (!q) return undefined;
  const count = q.evidence.length;
  const piece = Math.min(s.reader ?? 0, Math.max(0, count - 1));
  const e = [...q.evidence].reverse()[piece];
  const view = e ? readEvidence(e) : undefined;
  const rule = view
    ? [
        `Evidence ${piece + 1} of ${count}`,
        view.when,
        view.isMigrated && view.by ? `migrated from ${view.by}` : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "No evidence filed";
  return {
    meta: metaText(q, o.now),
    title: q.claim,
    sections: [
      {
        rule,
        action:
          count > 1
            ? { label: "Next", hotkey: "n", hit: BUTTONS.next, hovered: s.hover === BUTTONS.next }
            : undefined,
      },
      ...evidenceSections(q, piece),
    ],
    height: l.body,
    offset: s.scroll.detail,
  };
}

function footerButtons(s: ScreenState, o: ScreenOptions, room: number): Button[] {
  const width = (b: Pick<Button, "label" | "hotkey">) =>
    cellWidth(`${b.label} [${b.hotkey}]`) + tokens.gutter;
  const rest: Button[] = [
    { hotkey: "a", label: "Apply", hit: BUTTONS.apply, essential: true },
    { hotkey: "d", label: "Dismiss", hit: BUTTONS.dismiss, essential: true },
  ];
  const third: Button =
    s.reader === undefined
      ? { hotkey: "e", label: "Evidence", hit: BUTTONS.evidence }
      : { hotkey: "esc", label: "Back", hit: BUTTONS.back };
  const restWidth = rest.reduce((n, b) => n + width(b), 0);
  // The main action says as much as fits beside the other buttons: first with the third one,
  // which then stays put, else beside Apply and Dismiss alone.
  const labels = mainLabels(s);
  const fits = (label: string, beside: number) =>
    cellWidth(`${label} ${tokens.glyph.enter}`) + beside <= room;
  const main =
    labels.find((label) => fits(label, restWidth + width(third))) ??
    labels.find((label) => fits(label, restWidth)) ??
    labels[labels.length - 1]!;
  return [
    { hotkey: "enter", label: main, hit: BUTTONS.main, isLit: isAnySet(s), essential: true },
    ...rest,
    third,
    ...(o.wholeDoc ? [{ hotkey: "A/D", label: "whole doc" }] : []),
  ];
}

/** The footer's row, the control under the mouse drawn as such. */
function footerRow(s: ScreenState, o: ScreenOptions, room: number): Line {
  const keys = footerButtons(s, o, room);
  const plain = buttonRow(keys, room)[0] ?? line([]);
  let x = 0;
  let hover: { x: number; y: number } | undefined;
  for (const sp of plain.spans) {
    if (s.hover && sp.hit === s.hover && !hover) hover = { x, y: 0 };
    x += cellWidth(sp.text);
  }
  return hover ? (buttonRow(keys, room, { hover })[0] ?? plain) : plain;
}

/** `Doc suggestions ── 3 of 28 decided`: the title and how far the person got, where it fits. */
function caption(s: ScreenState, room: number): Span[] {
  const title = span(TITLE, { role: "accent", bold: true });
  const decided = s.queue.filter((q) => s.set[q.id]).length;
  const rule = [
    span(" "),
    span(tokens.glyph.rule.repeat(tokens.gutter), { role: "border" }),
    span(" "),
  ];
  const tiers = [
    [title, ...rule, span(`${decided} of ${s.queue.length} decided`, { role: "dim" })],
    [title, ...rule, span(`${decided}/${s.queue.length}`, { role: "dim" })],
  ];
  return tiers.find((tier) => spansWidth(tier) <= room) ?? [title];
}

/** A row set in to the screen's left edge, where the paths and the marks' pointer start. */
const inset = (l: Line, by = EDGE): Line =>
  l.spans.length ? { ...l, spans: [span(" ".repeat(by)), ...l.spans] } : l;

const padTo = (rows: Line[], n: number) => [
  ...rows.slice(0, n),
  ...Array.from({ length: Math.max(0, n - rows.length) }, blank),
];

/** The screen at `width` by `height` cells: every row at most `width` cells. */
export function drawScreen(s: ScreenState, o: ScreenOptions): Drawn {
  const close = {
    confirming: s.confirming,
    hover: closeOf(s.hover),
    question: "Discard choices?",
  };
  const { width } = o;
  if (s.queue.length === 0) {
    const said = `No open suggestions${s.dismissed ? ` · ${s.dismissed} dismissed` : ""}`;
    return {
      lines: captionFrame({
        width,
        title: TITLE,
        close,
        body: [inset(line([span(said, { role: "dim" })]), EDGE - RIGHT)],
      }),
      zones: {},
    };
  }
  const l = layout(s, o);
  const footer = inset(footerRow(s, o, l.innerWidth), EDGE - RIGHT);
  const notice = s.notice
    ? inset(line([span(s.notice, { role: "error" })]), EDGE - RIGHT)
    : undefined;
  const [top, gap, noticeRow, footerLine, bottom] = captionFrame({
    width,
    title: TITLE,
    caption: (room) => caption(s, room),
    close,
    body: [],
    footer,
    notice,
  });
  const at = l.isTiny ? 1 : captionFrameLayout.y;
  let body: Line[];
  let zones: Zones;
  if (s.reader !== undefined) {
    const d = readerDetail(s, o, l);
    body = padTo(
      (d ? detail(d, l.innerWidth) : []).map((row) => inset(row)),
      l.body,
    );
    zones = { detail: [at, at + l.body] };
  } else {
    const rows = padTo(list(listOf(s, l), l.listWidth), l.list);
    const d = l.isTiny ? undefined : focusedDetail(s, o, l);
    const under = d ? detail(d, l.innerWidth).map((row) => inset(row)) : [];
    body = padTo(l.isTiny ? rows : [...rows, blank(), ...under], l.body);
    zones = l.isTiny
      ? { list: [at, at + l.list] }
      : { list: [at, at + l.list], detail: [at + l.list + 1, at + l.body] };
  }
  if (l.isTiny)
    // The notice, when there is one, takes the body's last row.
    return {
      lines: [top!, ...(notice ? [...body.slice(0, -1), noticeRow!] : body), footerLine!, bottom!],
      zones,
    };
  return { lines: [top!, gap!, ...body, noticeRow!, footerLine!, bottom!], zones };
}

// ---- the reducer

/** Every suggestion's id, in the order the queue draws them. */
const order = (s: ScreenState) => byTarget(s.queue).flatMap(([, rows]) => rows.map((q) => q.id));

/** `s` with the keyboard on `id`: its windows back where the keyboard puts them. */
const focusOn = (s: ScreenState, id: string | undefined): ScreenState =>
  id === undefined || id === s.focus
    ? s
    : {
        ...s,
        focus: id,
        reader: s.reader === undefined ? undefined : 0,
        scroll: { list: 0, detail: 0 },
      };

/** The next row after `id` still left alone, round to the top; `undefined` when none is. */
function nextOpen(s: ScreenState, id: string | undefined): string | undefined {
  const ids = order(s);
  const from = id === undefined ? -1 : ids.indexOf(id);
  for (let i = 1; i <= ids.length; i++) {
    const next = ids[(from + i) % ids.length];
    if (next !== undefined && !s.set[next]) return next;
  }
  return undefined;
}

/** The rows of the doc `target`: the first still left alone, else its first. */
function docEntry(s: ScreenState, target: string): string | undefined {
  const rows = s.queue.filter((q) => q.target === target);
  return (rows.find((q) => !s.set[q.id]) ?? rows[0])?.id;
}

function scrollBy(s: ScreenState, o: ScreenOptions, zone: "list" | "detail", by: number) {
  const l = layout(s, o);
  if (zone === "list") {
    const range = listRange(listOf(s, l));
    const next = Math.max(range.min, Math.min(range.max, s.scroll.list + by));
    return { ...s, scroll: { ...s.scroll, list: next } };
  }
  const d = s.reader !== undefined ? readerDetail(s, o, l) : focusedDetail(s, o, l);
  const max = d ? detailRange(d, l.innerWidth) : 0;
  const next = Math.max(0, Math.min(max, s.scroll.detail + by));
  return { ...s, scroll: { ...s.scroll, detail: next } };
}

const done = (state: ScreenState, effect?: Effect) => ({ state, effect });

/** What a key or click does: the next state, and what the client does besides drawing. */
export function reduce(
  s: ScreenState,
  intent: Intent,
  o: ScreenOptions,
): { state: ScreenState; effect?: Effect } {
  if (intent.do === "hover") return done({ ...s, hover: intent.hit });
  if (s.queue.length === 0) {
    const isClose =
      intent.do === "main" ||
      intent.do === "close" ||
      intent.do === "escape" ||
      (intent.do === "press" && closeOf(intent.hit) === "close");
    return done(s, isClose ? "close" : undefined);
  }
  if (s.confirming) {
    if (intent.do === "press" && closeOf(intent.hit) === "discard") return done(s, "close");
    if (intent.do === "main") return done(s, "close");
    if (intent.do === "press" && closeOf(intent.hit) !== "keep") return done(s);
    if (intent.do === "focus" || intent.do === "scroll") return done(s);
    return done({ ...s, confirming: false });
  }
  const q = focused(s);
  switch (intent.do) {
    case "move": {
      if (s.reader !== undefined) return done(scrollBy(s, o, "detail", intent.by));
      const ids = order(s);
      const at = ids.indexOf(q?.id ?? "");
      return done(focusOn(s, ids[Math.max(0, Math.min(ids.length - 1, at + intent.by))]));
    }
    case "set": {
      if (!q) return done(s);
      const wasSet = s.set[q.id] === intent.choice;
      const next = { ...s, set: toggleChoice(s.set, [q.id], intent.choice), notice: undefined };
      return done(wasSet ? next : focusOn(next, nextOpen(next, q.id) ?? q.id));
    }
    case "doc": {
      if (!q) return done(s);
      const ids = s.queue.filter((r) => r.target === q.target).map((r) => r.id);
      const wasSet = ids.every((id) => s.set[id] === intent.choice);
      const next = { ...s, set: toggleChoice(s.set, ids, intent.choice), notice: undefined };
      if (wasSet) return done(next);
      const last = ids[ids.length - 1];
      return done(focusOn(next, nextOpen(next, last) ?? q.id));
    }
    case "reader":
      return done(
        s.reader === undefined
          ? { ...s, reader: 0, scroll: { ...s.scroll, detail: 0 } }
          : { ...s, reader: undefined, scroll: { ...s.scroll, detail: 0 } },
      );
    case "back":
      return done({ ...s, reader: undefined, scroll: { ...s.scroll, detail: 0 } });
    case "next": {
      const count = q?.evidence.length ?? 0;
      if (s.reader === undefined || count < 2) return done(s);
      return done({ ...s, reader: (s.reader + 1) % count, scroll: { ...s.scroll, detail: 0 } });
    }
    case "scroll":
      return done(scrollBy(s, o, intent.zone, intent.by));
    case "main":
      return done(s, isAnySet(s) ? "submit" : "close");
    case "close":
      return isAnySet(s) ? done({ ...s, confirming: true, hover: undefined }) : done(s, "close");
    case "escape":
      if (s.reader !== undefined) return reduce(s, { do: "back" }, o);
      return reduce(s, { do: "close" }, o);
    case "focus":
    case "press": {
      const { hit } = intent;
      const row = idOf(hit, "row:");
      if (row !== undefined) return done(focusOn(s, row));
      const doc = idOf(hit, "doc:");
      if (doc !== undefined) return done(focusOn(s, docEntry(s, doc)));
      if (intent.do === "focus") return done(s);
      const action: Record<string, Intent> = {
        [DETAIL]: { do: "reader" },
        [BUTTONS.main]: { do: "main" },
        [BUTTONS.apply]: { do: "set", choice: "apply" },
        [BUTTONS.dismiss]: { do: "set", choice: "dismiss" },
        [BUTTONS.evidence]: { do: "reader" },
        [BUTTONS.back]: { do: "back" },
        [BUTTONS.next]: { do: "next" },
        "frame:close": { do: "close" },
      };
      const next = action[hit];
      return next ? reduce(s, next, o) : done(s);
    }
  }
}

/** A step the page keys take: the focused suggestion's rows less one, so a line stays in view. */
const page = (s: ScreenState, o: ScreenOptions) => {
  const l = layout(s, o);
  return Math.max(1, (s.reader === undefined ? l.detail : l.body) - 2);
};

/**
 * What a key does, by name: `up`, `down`, `pageup`, `pagedown`, `enter`, `escape`, or the
 * character typed. `undefined` for a key the screen does not take.
 */
export function keyIntent(key: string, s: ScreenState, o: ScreenOptions): Intent | undefined {
  if (s.confirming) {
    if (key === "enter") return { do: "press", hit: "frame:discard" };
    return { do: "press", hit: "frame:keep" };
  }
  switch (key) {
    case "up":
    case "k":
      return { do: "move", by: -1 };
    case "down":
    case "j":
      return { do: "move", by: 1 };
    case "pageup":
      return { do: "scroll", zone: "detail", by: -page(s, o) };
    case "pagedown":
      return { do: "scroll", zone: "detail", by: page(s, o) };
    case "enter":
      return { do: "main" };
    case "escape":
      return { do: "escape" };
    case "a":
      return { do: "set", choice: "apply" };
    case "d":
      return { do: "set", choice: "dismiss" };
    case "A":
      return o.wholeDoc ? { do: "doc", choice: "apply" } : undefined;
    case "D":
      return o.wholeDoc ? { do: "doc", choice: "dismiss" } : undefined;
    case "e":
      return { do: "reader" };
    case "n":
      return { do: "next" };
  }
  return undefined;
}

/** The zone of the screen row `y`, for the wheel. */
export function zoneAt(zones: Zones, y: number): "list" | "detail" | undefined {
  if (zones.list && y >= zones.list[0] && y < zones.list[1]) return "list";
  if (zones.detail && y >= zones.detail[0] && y < zones.detail[1]) return "detail";
  return undefined;
}

/** The ids the main action carries out, apply and dismiss apart. */
export function decided(s: ScreenState) {
  return {
    applied: s.queue.filter((q) => s.set[q.id] === "apply"),
    dismissed: s.queue.filter((q) => s.set[q.id] === "dismiss"),
  };
}

/** Every control's `hit` the screen draws, for a client that asks whether one is its own. */
export const isScreenHit = (hit: string) =>
  hit.startsWith("row:") ||
  hit.startsWith("doc:") ||
  hit.startsWith("frame:") ||
  hit === DETAIL ||
  (Object.values(BUTTONS) as string[]).includes(hit);
