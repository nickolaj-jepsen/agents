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
  truncateSpans,
  type Line,
  type Span,
} from "../claude/kit/lines.ts";
import type { List, ListGroup } from "../claude/kit/list/contract.ts";
import {
  cutLeft,
  list,
  LIST_INSET,
  listFollow,
  listShowsWhole,
  listTopMax,
} from "../claude/kit/list/terminal.ts";
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
  /**
   * `list`: the queue window's first line, which moves only when the keyboard would leave the
   * window, or by the wheel. `detail`: rows the reader is scrolled.
   */
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
   * The client binds Shift+A and Shift+D apart from a and d, so whole doc has keys besides the
   * doc row's controls. Claude Code's hotkeys are one lowercase letter (Shift+a is a).
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
  /** Every row of a doc, the keyboard's unless `target` names one; `stay` keeps the keyboard. */
  | { do: "doc"; choice: Choice; target?: string; stay?: boolean }
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
export const markHit = (id: string) => `mark:${id}`;
export const docHit = (target: string) => `doc:${target}`;
export const allHit = (choice: Choice, target: string) => `all:${choice}:${target}`;
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
  return { apply, dismiss, left: s.queue.length - apply - dismiss };
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

/** The main action: one of three, by what it will do. */
function mainLabel(s: ScreenState) {
  const { apply, dismiss } = counts(s);
  return apply ? "Draft prompt" : dismiss ? "Dismiss" : "Close";
}

// ---- the layout

const EDGE = LIST_INSET;
const RIGHT = captionFrameLayout.x;
/** The seen count's column at the right of every row: `12×`. */
const ASIDE = 3;
/** Below this many rows the frame drops its blank row and the focused suggestion its meta line. */
const SHORT = 20;
/**
 * Below this many rows the queue is all there is, its rows carrying their doc, and the frame
 * has no bottom rule: Claude Code's pane above the prompt of a 24-row terminal, in its own box.
 */
const TINY = 9;
/** Rows the focused suggestion's claim and evidence each take at most, when the queue needs room. */
const CLAIM_ROWS = 3;
const EVIDENCE_ROWS = 3;

type Mode = "tiny" | "short" | "tall";

type Layout = {
  mode: Mode;
  /** Rows between the caption (and its blank row) and the notice row. */
  body: number;
  /** Rows of the queue and of the focused suggestion under it, a blank row between. */
  list: number;
  zone: number;
  listWidth: number;
  innerWidth: number;
};

const modeOf = (o: ScreenOptions): Mode =>
  o.height < TINY ? "tiny" : o.height < SHORT ? "short" : "tall";

/** Rows of the evidence text a suggestion has at `width`, uncut. */
const evidenceRows = (q: Suggestion, width: number) =>
  detail({ sections: evidenceSections(q, 0) }, width).length;

/** Rows of the claim under the queue: none when the queue's row shows it whole. */
function claimRows(q: Suggestion, l: Pick<Layout, "listWidth" | "innerWidth">) {
  if (listShowsWhole(q.claim, l.listWidth, ASIDE)) return 0;
  return Math.min(CLAIM_ROWS, detail({ title: q.claim }, l.innerWidth).length);
}

/** Rows the focused suggestion wants: the meta line, the claim, a blank row, the rule, evidence. */
function zoneNeed(q: Suggestion, mode: Mode, l: Pick<Layout, "listWidth" | "innerWidth">) {
  if (mode === "short") return claimRows(q, l) + 1;
  return 1 + claimRows(q, l) + 1 + 1 + Math.min(EVIDENCE_ROWS, evidenceRows(q, l.innerWidth));
}

function layout(s: ScreenState, o: ScreenOptions): Layout {
  const mode = modeOf(o);
  const widths = {
    listWidth: o.width - RIGHT,
    innerWidth: Math.max(1, o.width - EDGE - RIGHT),
  };
  const chrome = mode === "tiny" ? 2 : mode === "short" ? 4 : captionFrameLayout.chrome;
  const body = Math.max(1, o.height - chrome);
  if (mode === "tiny") return { mode, body, list: body, zone: 0, ...widths };
  const natural = byTarget(s.queue).reduce((n, [, rows]) => n + 1 + rows.length, 0);
  const need = Math.max(0, ...s.queue.map((q) => zoneNeed(q, mode, widths)));
  // The queue keeps three rows at least; the focused suggestion has what it needs of the rest.
  const zone = Math.max(1, Math.min(need, body - 1 - Math.min(3, natural)));
  const listRows = Math.max(1, Math.min(natural, body - 1 - zone));
  // A queue that fits leaves the rest to the focused suggestion.
  return { mode, body, list: listRows, zone: body - 1 - listRows, ...widths };
}

function listOf(s: ScreenState, l: Layout): List {
  const at = focused(s);
  const groups: ListGroup[] = byTarget(s.queue).map(([target, rows]) => {
    const isActive = rows.some((q) => q.id === at?.id);
    return {
      label: target,
      active: isActive,
      done: rows.every((q) => s.set[q.id]),
      hit: docHit(target),
      actions: isActive
        ? (["apply", "dismiss"] as const).map((choice) => ({
            label: choice === "apply" ? "Apply all" : "Dismiss all",
            hit: allHit(choice, target),
            hovered: s.hover === allHit(choice, target),
          }))
        : undefined,
      rows: rows.map((q) => ({
        text: q.claim,
        mark: s.set[q.id] === "apply" ? "chosen" : s.set[q.id] === "dismiss" ? "dropped" : "open",
        // The column is three cells: a hundred sightings and more read as `99+`.
        aside: seen(q) > 99 ? "99+" : repeats(q),
        focused: q.id === at?.id,
        hovered: s.hover === rowHit(q.id) || s.hover === markHit(q.id),
        hit: rowHit(q.id),
        markHit: markHit(q.id),
      })),
    };
  });
  return {
    groups,
    height: l.list,
    top: s.scroll.list,
    noun: ["doc", "docs"],
    aside: ASIDE,
    flat: l.mode === "tiny",
  };
}

/** A piece of evidence as sections in the order the core gives: the reason first. */
function evidenceSections(q: Suggestion, piece: number): DetailSection[] {
  const e = [...q.evidence].reverse()[piece];
  if (!e) return [];
  return evidenceBlocks(readEvidence(e)).map((b) => ({
    heading: b.heading || undefined,
    text: b.lines.join("\n") || undefined,
    items: b.items?.map((c) => ({ key: c.kind, value: c.value, isQuote: c.kind === "quote" })),
  }));
}

/** `Evidence · 2 pieces`, or `Evidence · 2 days ago` with one: the focused suggestion's rule. */
function evidenceRule(q: Suggestion, now: number) {
  const n = q.evidence.length;
  if (n === 0) return "No evidence filed";
  if (n > 1) return `Evidence · ${n} pieces`;
  return `Evidence · ${ageText(q.evidence[0]?.at ?? "", now)}`;
}

/**
 * The focused suggestion under the queue, in `rows` rows: its meta line, its claim when the row
 * cuts it, then the evidence rule, a control that opens the reader, and as much of the newest
 * evidence as the rows hold. The rule is drawn whatever else gives way.
 */
function focusedZone(s: ScreenState, o: ScreenOptions, l: Layout, rows: number): Line[] {
  const q = focused(s);
  if (!q || rows < 1) return [];
  const isTall = l.mode === "tall";
  const read = {
    label: "Read",
    hotkey: "e",
    hit: BUTTONS.evidence,
    hovered: s.hover === BUTTONS.evidence,
  };
  const rule = detail({ sections: [{ rule: evidenceRule(q, o.now), action: read }] }, l.innerWidth);
  let head = detail(
    {
      meta: isTall ? metaText(q, o.now) : undefined,
      title: claimRows(q, l) ? q.claim : undefined,
      titleMax: CLAIM_ROWS,
      hit: DETAIL,
      hovered: s.hover === DETAIL,
    },
    l.innerWidth,
  );
  const gap = isTall && head.length ? [blank()] : [];
  // What gives way first: the evidence, the blank row, then the claim's last rows.
  let room = rows - rule.length;
  head = head.slice(0, Math.max(0, room));
  room -= head.length;
  const spacer = gap.slice(0, Math.max(0, room));
  room -= spacer.length;
  const evidence =
    isTall && room > 0
      ? detail({ sections: evidenceSections(q, 0), height: room, hit: DETAIL }, l.innerWidth)
      : [];
  return [...head, ...spacer, ...rule, ...evidence].map((row) => inset(row));
}

/** `● docs/agents.md · wrong · seen 3× · 2 days ago      Back [esc]`: where the reader is. */
function readerHead(s: ScreenState, q: Suggestion, o: ScreenOptions, width: number): Line {
  const choice = s.set[q.id];
  const style =
    choice === "apply"
      ? ({ role: "accent", bold: true } as const)
      : choice === "dismiss"
        ? ({ role: "dim" } as const)
        : ({ role: "text" } as const);
  const glyph =
    choice === "apply"
      ? tokens.glyph.single.on
      : choice === "dismiss"
        ? tokens.glyph.dropped
        : tokens.glyph.single.off;
  const back = [
    span("Back", {
      role: "text",
      bold: s.hover === BUTTONS.back || undefined,
      hit: BUTTONS.back,
    }),
    span(" ", { hit: BUTTONS.back }),
    span("[esc]", { role: "dim", hit: BUTTONS.back }),
  ];
  const room = width - spansWidth(back) - tokens.gutter;
  const mark = span(glyph, choice ? style : { role: "dim" });
  const meta = span(` · ${metaText(q, o.now)}`, { role: "dim" });
  // The path is the row's title: the meta line's end gives way first.
  const path = span(cutLeft(q.target, Math.max(1, room - 2)), style);
  const left = truncateSpans([mark, span(" "), path, meta], Math.max(0, room));
  const pad = width - spansWidth(left) - spansWidth(back);
  return line([...left, span(" ".repeat(Math.max(1, pad))), ...back]);
}

/** The reader under its head row: the claim whole, then one piece of evidence. */
function readerDetail(s: ScreenState, o: ScreenOptions, l: Layout): Detail | undefined {
  const q = focused(s);
  if (!q) return undefined;
  const count = q.evidence.length;
  const piece = Math.min(s.reader ?? 0, Math.max(0, count - 1));
  const e = [...q.evidence].reverse()[piece];
  const view = e ? readEvidence(e) : undefined;
  const rule = e
    ? [
        count > 1 ? `Evidence ${piece + 1} of ${count}` : "Evidence",
        ageText(e.at, o.now),
        view?.isMigrated && view.by ? `migrated from ${view.by}` : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "No evidence filed";
  return {
    title: q.claim,
    sections: [
      {
        rule,
        action:
          count > 1
            ? {
                label: "Next",
                hotkey: "n",
                hit: BUTTONS.next,
                hovered: s.hover === BUTTONS.next,
                isDim: piece >= count - 1,
              }
            : undefined,
      },
      ...evidenceSections(q, piece),
    ],
    height: Math.max(1, l.body - 1),
    offset: s.scroll.detail,
  };
}

/** The footer: the main action, then Apply and Dismiss. Dim and inert while Close asks. */
function footerRow(s: ScreenState, room: number): Line {
  const keys: Button[] = [
    {
      hotkey: "enter",
      label: mainLabel(s),
      hit: BUTTONS.main,
      isLit: isAnySet(s),
      essential: true,
    },
    { hotkey: "a", label: "Apply", hit: BUTTONS.apply, essential: true },
    { hotkey: "d", label: "Dismiss", hit: BUTTONS.dismiss, essential: true },
  ];
  if (s.confirming) {
    const row = buttonRow(keys, room)[0] ?? line([]);
    return line(row.spans.map(({ text }) => span(text, { role: "dim" })));
  }
  const plain = buttonRow(keys, room)[0] ?? line([]);
  let x = 0;
  let hover: { x: number; y: number } | undefined;
  for (const sp of plain.spans) {
    if (s.hover && sp.hit === s.hover && !hover) hover = { x, y: 0 };
    x += cellWidth(sp.text);
  }
  return hover ? (buttonRow(keys, room, { hover })[0] ?? plain) : plain;
}

/** `● 3 · – 2 · 23 left`, in the rows' own glyphs: dim, what is set to apply in the accent. */
function tally(s: ScreenState): Span[] {
  const { apply, dismiss, left } = counts(s);
  return [
    span(`${tokens.glyph.single.on} ${apply}`, { role: apply ? "accent" : "dim" }),
    span(` · ${tokens.glyph.dropped} ${dismiss} · ${left} left`, { role: "dim" }),
  ];
}

/** The title and the tally where both fit, else the tally alone, else the title. */
function caption(s: ScreenState, room: number): Span[] {
  const title = span(TITLE, { role: "accent", bold: true });
  const rule = [
    span(" "),
    span(tokens.glyph.rule.repeat(tokens.gutter), { role: "border" }),
    span(" "),
  ];
  const tiers = [[title, ...rule, ...tally(s)], tally(s), [title]];
  return tiers.find((tier) => spansWidth(tier) <= room) ?? [];
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
  const setCount = s.queue.filter((q) => s.set[q.id]).length;
  const close = {
    confirming: s.confirming,
    hover: closeOf(s.hover),
    question: `Discard ${setCount}?`,
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
  const footer = inset(footerRow(s, l.innerWidth), EDGE - RIGHT);
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
  const at = l.mode === "tall" ? captionFrameLayout.y : 1;
  let body: Line[];
  let zones: Zones;
  const q = focused(s);
  if (s.reader !== undefined && q) {
    const d = readerDetail(s, o, l);
    const rows = d ? detail(d, l.innerWidth).map((row) => inset(row)) : [];
    body = padTo([inset(readerHead(s, q, o, l.innerWidth)), ...rows], l.body);
    zones = { detail: [at + 1, at + l.body] };
  } else {
    const rows = padTo(list(listOf(s, l), l.listWidth), l.list);
    body =
      l.mode === "tiny"
        ? padTo(rows, l.body)
        : padTo([...rows, blank(), ...focusedZone(s, o, l, l.zone)], l.body);
    zones = { list: [at, at + l.list] };
  }
  if (l.mode === "tiny")
    // The notice, when there is one, takes the body's last row; the host's box is the edge.
    return {
      lines: [top!, ...(notice ? [...body.slice(0, -1), noticeRow!] : body), footerLine!],
      zones,
    };
  const head = l.mode === "tall" ? [top!, gap!] : [top!];
  return { lines: [...head, ...body, noticeRow!, footerLine!, bottom!], zones };
}

// ---- the reducer

/** Every suggestion's id, in the order the queue draws them. */
const order = (s: ScreenState) => byTarget(s.queue).flatMap(([, rows]) => rows.map((q) => q.id));

/** `s` with the keyboard on `id`; the queue's window stays where it is. */
const focusOn = (s: ScreenState, id: string | undefined): ScreenState =>
  id === undefined || id === s.focus
    ? s
    : {
        ...s,
        focus: id,
        reader: s.reader === undefined ? undefined : 0,
        scroll: { ...s.scroll, detail: 0 },
      };

/** The queue's window moved as little as keeps the keyboard's row in it, two rows round it. */
const follow = (s: ScreenState, o: ScreenOptions): ScreenState => ({
  ...s,
  scroll: { ...s.scroll, list: listFollow(listOf(s, layout(s, o))) },
});

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

/** A click on a mark steps it: left alone, apply, dismiss, left alone. */
const stepped = (choice: Choice | undefined): Choice | undefined =>
  choice === undefined ? "apply" : choice === "apply" ? "dismiss" : undefined;

function scrollBy(s: ScreenState, o: ScreenOptions, zone: "list" | "detail", by: number) {
  const l = layout(s, o);
  if (zone === "list") {
    const max = listTopMax(listOf(s, l));
    const next = Math.max(0, Math.min(max, s.scroll.list + by));
    return { ...s, scroll: { ...s.scroll, list: next } };
  }
  const d = s.reader !== undefined ? readerDetail(s, o, l) : undefined;
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
  const isReading = s.reader !== undefined;
  switch (intent.do) {
    case "move": {
      if (isReading) return done(scrollBy(s, o, "detail", intent.by));
      const ids = order(s);
      const at = ids.indexOf(q?.id ?? "");
      const to = ids[Math.max(0, Math.min(ids.length - 1, at + intent.by))];
      return done(follow(focusOn(s, to), o));
    }
    case "set": {
      if (!q) return done(s);
      const wasSet = s.set[q.id] === intent.choice;
      const next = { ...s, set: toggleChoice(s.set, [q.id], intent.choice), notice: undefined };
      // The reader stays on its suggestion; the queue moves on to the next one left alone.
      if (wasSet || isReading) return done(next);
      return done(follow(focusOn(next, nextOpen(next, q.id) ?? q.id), o));
    }
    case "doc": {
      const target = intent.target ?? q?.target;
      if (target === undefined) return done(s);
      const ids = s.queue.filter((r) => r.target === target).map((r) => r.id);
      const wasSet = ids.every((id) => s.set[id] === intent.choice);
      const next = { ...s, set: toggleChoice(s.set, ids, intent.choice), notice: undefined };
      if (wasSet || intent.stay || isReading) return done(next);
      return done(follow(focusOn(next, nextOpen(next, ids[ids.length - 1]) ?? q?.id), o));
    }
    case "reader":
      return done({
        ...s,
        reader: isReading ? undefined : 0,
        scroll: { ...s.scroll, detail: 0 },
      });
    case "back":
      return done({ ...s, reader: undefined, scroll: { ...s.scroll, detail: 0 } });
    case "next": {
      const count = q?.evidence.length ?? 0;
      if (s.reader === undefined || s.reader >= count - 1) return done(s);
      return done({ ...s, reader: s.reader + 1, scroll: { ...s.scroll, detail: 0 } });
    }
    case "scroll":
      return done(scrollBy(s, o, intent.zone, intent.by));
    case "main":
      return done(s, isAnySet(s) ? "submit" : "close");
    case "close":
      return isAnySet(s) ? done({ ...s, confirming: true, hover: undefined }) : done(s, "close");
    case "escape":
      if (isReading) return reduce(s, { do: "back" }, o);
      return reduce(s, { do: "close" }, o);
    case "focus":
    case "press": {
      const { hit } = intent;
      // A click puts the keyboard where it lands; the window stays under the pointer.
      const row = idOf(hit, "row:") ?? idOf(hit, "mark:");
      if (row !== undefined) {
        const there = focusOn(s, row);
        if (intent.do === "focus" || !hit.startsWith("mark:")) return done(there);
        const choice = stepped(there.set[row]);
        const set = { ...there.set };
        if (choice) set[row] = choice;
        else delete set[row];
        return done({ ...there, set, notice: undefined });
      }
      const doc = idOf(hit, "doc:");
      if (doc !== undefined) return done(focusOn(s, docEntry(s, doc)));
      if (intent.do === "focus") return done(s);
      const all = /^all:(apply|dismiss):(.*)$/.exec(hit);
      if (all)
        return reduce(s, { do: "doc", choice: all[1] as Choice, target: all[2], stay: true }, o);
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

/** A step the page keys take: a window less one row, so a line stays in view. */
const page = (s: ScreenState, o: ScreenOptions) => {
  const l = layout(s, o);
  return Math.max(1, (s.reader === undefined ? l.list : l.body - 1) - 2);
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
  const zone = s.reader === undefined ? "list" : "detail";
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

/** Rows one notch of the wheel moves a zone. */
export const WHEEL_ROWS = 3;

/** The ids the main action carries out, apply and dismiss apart. */
export function decided(s: ScreenState) {
  return {
    applied: s.queue.filter((q) => s.set[q.id] === "apply"),
    dismissed: s.queue.filter((q) => s.set[q.id] === "dismiss"),
  };
}

/** Every control's `hit` the screen draws, for a client that asks whether one is its own. */
export const isScreenHit = (hit: string) =>
  /^(row|mark|doc|all|frame):/.test(hit) ||
  hit === DETAIL ||
  (Object.values(BUTTONS) as string[]).includes(hit);
