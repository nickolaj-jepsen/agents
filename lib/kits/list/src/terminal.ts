/** The list as styled lines: the one drawing both terminals paint. */
import { controlStyle, rail } from "@agents/kit-card/terminal.ts";
import {
  blank,
  block,
  cellWidth,
  ELLIPSIS,
  hitSpans,
  inline,
  line,
  literal,
  moreText,
  span,
  spansWidth,
  truncate,
  truncateSpans,
  type Line,
  type Span,
  type Style,
} from "@agents/kit-core/lines.ts";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { Button } from "@agents/kit-buttons/contract.ts";
import { buttonRow } from "@agents/kit-buttons/terminal.ts";
import type { List, ListGroup, ListRow } from "./contract.ts";

const GAP = " ".repeat(tokens.gutter);

/** Cells the rail and its gap take: where a group's label and a row's pointer start. */
export const LIST_INSET = cellWidth(tokens.glyph.rail) + tokens.gutter;

/** Cells of the pointer column and the space after it. */
const POINTER = cellWidth(tokens.glyph.pointer) + 1;

/** Cells of a mark and the space after it. */
const MARK = cellWidth(tokens.glyph.single.off) + 1;

const allRows = (l: Partial<Pick<List, "groups">>): ListRow[] =>
  (l.groups ?? []).flatMap((g) => g.rows);

/** Cells the list's keys take, with the space after: the widest key, or none where no row has one. */
const keyCells = (l: Room): number => {
  const widest = Math.max(0, ...allRows(l).map((r) => cellWidth(r.key ?? "")));
  return widest ? widest + 1 : 0;
};

/** Cells the mark takes: none where every row says `none`, so a menu of keys starts at its keys. */
const markCells = (l: Room): number => {
  const rows = allRows(l);
  return rows.length && rows.every((r) => r.mark === "none") ? 0 : MARK;
};

/** Cells before a row's text: the pointer column, the key, the mark and their spaces. */
const leadCells = (l: Room): number => POINTER + keyCells(l) + markCells(l);

/** Cells a group's label keeps beside its controls. */
const MIN_LABEL = 10;

/** Between a flat row's group label and its text. */
const SEPARATOR = " › ";

/**
 * What of a list sets its rows' room: its aside column, its lines, whether it has rails, and
 * its rows, whose keys and marks take cells before the text.
 */
type Room = Pick<List, "aside" | "lines" | "rail"> & Partial<Pick<List, "groups">>;

/** Cells before a group's label and a row's pointer: the rail and its gap, or none without rails. */
const insetOf = (l: Room) => (l.rail === false ? 0 : LIST_INSET);

/** Cells a row's text has at `width`, beside the list's aside column. */
export function listTextRoom(width: number, l: Room = {}): number {
  const aside = l.aside ?? 0;
  return Math.max(1, width - insetOf(l) - leadCells(l) - (aside > 0 ? aside + tokens.gutter : 0));
}

/**
 * Whether a row of the list shows all of `text` at `width`, in the lines its text may take: else
 * show it elsewhere.
 */
export const listShowsWhole = (text: string, width: number, l: Room = {}) =>
  (l.lines ?? 1) > 1
    ? block(inline(text), listTextRoom(width, l)).length <= (l.lines ?? 1)
    : spansWidth(inline(text)) <= listTextRoom(width, l);

/** `label` cut from the left to `width` cells: whole folders first, then letters. */
export function cutLeft(label: string, width: number): string {
  if (cellWidth(label) <= width) return label;
  const parts = label.split("/");
  for (let i = 1; i < parts.length; i++) {
    const tail = `${ELLIPSIS}/${parts.slice(i).join("/")}`;
    if (cellWidth(tail) <= width) return tail;
  }
  // No folder fits whole: the end of the name, its first letters cut.
  const chars = [...label];
  let out = "";
  for (let i = chars.length - 1; i >= 0; i--) {
    const next = (chars[i] ?? "") + out;
    if (cellWidth(ELLIPSIS + next) > width) break;
    out = next;
  }
  return width < 1 ? "" : ELLIPSIS + out;
}

/** A flat row's group label: whole when it fits `width`, else its last part, cut from the left. */
function shortLabel(label: string, width: number): string {
  if (cellWidth(label) <= width) return label;
  return cutLeft(label.split("/").pop() ?? label, width);
}

/** `left` and `right` on one row of `width` cells, `right` at its end. */
function spread(left: Span[], right: Span[], width: number): Span[] {
  const room = width - spansWidth(right) - (right.length ? tokens.gutter : 0);
  const cut = truncateSpans(left, Math.max(0, room));
  const pad = width - spansWidth(cut) - spansWidth(right);
  return right.length ? [...cut, span(" ".repeat(Math.max(1, pad))), ...right] : cut;
}

const actionSpans = (actions: readonly Button[]): Span[] =>
  buttonRow(
    actions.map((a) => ({ ...a, hotkey: "", isQuiet: true })),
    Number.MAX_SAFE_INTEGER,
  )[0]?.spans ?? [];

/** A line behind its group's rail, or as it is where the list draws none. */
const behind = (l: List, state: { active?: boolean; answered?: boolean }, row: Line): Line =>
  l.rail === false ? row : rail(state, row);

/** A group's row: its label, cut from the left, and its controls at the right. */
function groupRow(g: ListGroup, l: List, width: number): Line {
  const room = width - insetOf(l);
  const all = g.actions?.length ? actionSpans(g.actions) : [];
  // The controls go when they would leave the label too little room to be read.
  const actions = room - spansWidth(all) - tokens.gutter >= MIN_LABEL ? all : [];
  const labelRoom = room - (actions.length ? spansWidth(actions) + tokens.gutter : 0);
  const label = span(cutLeft(g.label, Math.max(1, labelRoom)), {
    role: g.active ? "accent" : "dim",
    ...(g.hit && actions.length ? { hit: g.hit } : {}),
  });
  const spans = spread([label], actions, room);
  // With controls of its own the row is several; else the whole row is the group's.
  return behind(
    l,
    { active: g.active, answered: g.done },
    line(spans, actions.length ? undefined : g.hit),
  );
}

/** Rows a row's text may take: one in a flat list, whose rows are for little room. */
const textRows = (l: List) => (l.flat ? 1 : Math.max(1, l.lines ?? 1));

/**
 * One row: the pointer column, the mark, the text and the aside at the right. The text is cut
 * to the row, or with `rows` over one wrapped to as many, each later line hanging under the first.
 */
function itemRows(r: ListRow, g: ListGroup, l: List, width: number, rows = textRows(l)): Line[] {
  const mark = r.mark ?? "open";
  const isLit = (r.focused || r.hovered) && !r.disabled;
  const hit = r.disabled ? undefined : r.hit;
  const markHit = r.disabled ? undefined : r.markHit;
  const words: Style =
    r.disabled || mark === "dropped"
      ? { role: "dim", bold: isLit || undefined }
      : controlStyle({ primary: mark === "chosen", highlighted: isLit });
  const glyph =
    mark === "chosen"
      ? span(tokens.glyph.single.on, { role: "accent", bold: true })
      : mark === "dropped"
        ? span(tokens.glyph.dropped, { role: "dim" })
        : span(tokens.glyph.single.off, { role: "dim" });
  // Cells a key takes, with its space: a row without one keeps them blank, so the text lines up.
  const keys = keyCells(l);
  const key = keys
    ? [
        span((r.key ?? "").padEnd(keys - 1), { role: g.active && !r.disabled ? "accent" : "dim" }),
        span(" "),
      ]
    : [];
  const hasMark = markCells(l) > 0;
  const pointer = r.focused
    ? [span(tokens.glyph.pointer, { role: "text", bold: true }), span(" ")]
    : [span(" ".repeat(cellWidth(tokens.glyph.pointer) + 1))];
  const room = width - insetOf(l);
  const aside = l.aside ?? 0;
  const textRoom = listTextRoom(width, l);
  // Code keeps the row's style: a row's colour is what it is set to, across its whole label.
  let spans = (r.literal ? literal(r.text, words) : inline(r.text, words)).map((sp) =>
    sp.role === "code" ? { ...words, text: sp.text } : sp,
  );
  if (l.flat) {
    const label = shortLabel(g.label, Math.max(4, Math.floor(textRoom / 3)));
    spans = [span(label, { role: "dim" }), span(SEPARATOR, { role: "dim" }), ...spans];
  }
  const texts =
    rows > 1
      ? block(spans, textRoom, { max: rows }).map((row) => row.spans)
      : [truncateSpans(spans, textRoom)];
  const lead = [
    ...pointer,
    ...key,
    ...(hasMark ? (mark === "none" ? [span(" ".repeat(MARK))] : [glyph, span(" ")]) : []),
  ];
  const right =
    aside > 0
      ? [
          span(truncate(r.aside ?? "", aside).padStart(aside), {
            role: r.aside ? "dim" : undefined,
          }),
        ]
      : [];
  const state = { active: g.active, answered: g.done };
  return texts.map((text, i) => {
    // The mark and the aside are the first line's; a later line is the row's text alone.
    if (i > 0) {
      const hang = span(" ".repeat(spansWidth(lead)));
      return behind(l, state, line([hang, ...(hit ? hitSpans(text, hit) : text)]));
    }
    const body = spread(text, right, room - spansWidth(lead));
    if (markHit === undefined) return behind(l, state, line([...lead, ...body], hit));
    return behind(
      l,
      state,
      line([...hitSpans(lead, markHit), ...(hit ? hitSpans(body, hit) : body)]),
    );
  });
}

/** A line of the list drawn whole: a group's row, or line `part` of a row's text. */
type Entry = { group: number; row?: number; part?: number; isGap?: boolean };

/**
 * The group, row and line of each line of the list drawn whole at `width`: a group's row, each
 * line of each of its rows, and with `space` a blank line before every group but the first.
 */
const entriesOf = (l: List, width: number): Entry[] =>
  l.groups.flatMap((g, group) => [
    ...(l.space && !l.flat && group > 0 ? [{ group, isGap: true }] : []),
    ...(l.flat || !g.label ? [] : [{ group }]),
    ...g.rows.flatMap((r, row) =>
      textRows(l) > 1
        ? itemRows(r, g, l, width).map((_, part) => ({ group, row, part }))
        : [{ group, row, part: 0 }],
    ),
  ]);

const isGroupRow = (e: Entry | undefined) => !!e && e.row === undefined && !e.isGap;

const isFocused = (l: List, e: Entry) =>
  e.row !== undefined && Boolean(l.groups[e.group]?.rows[e.row]?.focused);

/** The first line of a row: what counts it, where its later lines do not. */
const isRow = (e: Entry) => e.row !== undefined && !e.part;

const sameRow = (a: Entry | undefined, b: Entry | undefined) =>
  !!a && !!b && a.row !== undefined && a.group === b.group && a.row === b.row;

type Window = { top: number; rows: number; max: number };

/** The window's rows, its more-row aside, and the furthest its top goes; none when all fits. */
function windowOf(l: List, entries: readonly Entry[]): Window | undefined {
  const height = l.height ?? Infinity;
  if (entries.length <= height) return undefined;
  // Three rows and more keep the last to say what is hidden.
  const rows = height >= 3 ? height - 1 : Math.max(1, height);
  const max = Math.max(0, entries.length - rows);
  let top = Math.max(0, Math.min(max, l.top ?? 0));
  // A window opens on a row's first line or a group's row: not on the end of a row, which alone
  // says little, nor on the blank line between two groups.
  while (entries[top]?.part || entries[top]?.isGap) top++;
  return { top, rows, max };
}

/**
 * The top a window takes so the keyboard's row stays in it, every line of it, with `context`
 * lines on either side: it moves only as far as that needs, and not at all while the row is well
 * inside.
 */
export function listFollow(l: List, width: number, context = 2): number {
  const entries = entriesOf(l, width);
  const w = windowOf(l, entries);
  if (!w) return 0;
  const at = entries.findIndex((e) => isFocused(l, e));
  if (at < 0) return w.top;
  let end = at;
  while (end + 1 < entries.length && isFocused(l, entries[end + 1]!)) end++;
  const ctx = Math.min(context, Math.max(0, Math.floor((w.rows - (end - at + 1)) / 2)));
  let top = w.top;
  if (end > top + w.rows - 1 - ctx) top = end - (w.rows - 1 - ctx);
  if (at < top + ctx) top = at - ctx;
  return Math.max(0, Math.min(w.max, top));
}

/** Rows the list takes drawn whole at `width`: its lines, and with `space` those between groups. */
export const listRows = (l: List, width: number): number => entriesOf(l, width).length;

/** The furthest a window's `top` goes at `width`: 0 for a list drawn whole. */
export function listTopMax(l: List, width: number): number {
  return windowOf(l, entriesOf(l, width))?.max ?? 0;
}

/** How many rows a run of lines holds: a row counts where its first line is. */
const rowsIn = (entries: readonly Entry[]) => entries.filter(isRow).length;

/**
 * Groups of rows behind the card's rail: each group's row, then a row per item with its mark and
 * its text, on one line or wrapped to `lines`. Taller than `height`, it is a window from `top`:
 * the keyboard's group row stands in for its first row when it is above the window, a group row
 * is never its last, a row its end cuts ends in `…` there, and its last row says how many rows
 * are above it and below.
 */
export function list(l: List, width: number): Line[] {
  const entries = entriesOf(l, width);
  /** Line `e.part` of its row, the row drawn in `rows` lines where the window has no more. */
  const draw = (e: Entry, rows?: number): Line => {
    const g = l.groups[e.group]!;
    const r = e.row === undefined ? undefined : g.rows[e.row];
    if (e.isGap) return blank();
    return r ? (itemRows(r, g, l, width, rows)[e.part ?? 0] ?? blank()) : groupRow(g, l, width);
  };
  const w = windowOf(l, entries);
  if (!w) return entries.map((e) => draw(e));
  type Shown = { e: Entry; rows?: number } | undefined;
  const shown: Shown[] = Array.from({ length: w.rows }, (_, i) => {
    const e = entries[w.top + i];
    return e && { e };
  });
  const at = entries.findIndex((e) => isFocused(l, e));
  const head = entries.findIndex((e) => isGroupRow(e) && e.group === entries[at]?.group);
  const stands = w.rows > 1 && head >= 0 && head < w.top && at > w.top && at < w.top + w.rows;
  // The row the group row stands on keeps the lines under it, drawn in as many: its end is cut.
  let under = 0;
  if (stands) {
    const covered = entries[w.top];
    while (sameRow(shown[1 + under]?.e, covered)) under++;
    for (let i = 0; i < under; i++) shown[1 + i] = { e: { ...covered!, part: i }, rows: under };
    shown[0] = { e: entries[head]! };
  }
  const lastAt = shown.length - 1;
  if (w.rows > 1 && isGroupRow(shown[lastAt]?.e)) shown[lastAt] = undefined;
  // The row the window ends inside has the lines it shows of it, the last ending in `…`.
  const last = shown[lastAt]?.e;
  const cut = sameRow(last, entries[w.top + w.rows]) ? (last?.part ?? 0) + 1 : undefined;
  const lines = shown.map((x) =>
    x ? draw(x.e, x.rows ?? (sameRow(x.e, last) ? cut : undefined)) : blank(),
  );
  if (w.rows >= (l.height ?? 0)) return lines;
  // The row a group row stands on is hidden, unless lines of it show under the group row.
  const up = rowsIn(entries.slice(0, w.top + (stands && !under ? 1 : 0)));
  const down = rowsIn(entries.slice(w.top + w.rows));
  const text = [
    up ? moreText(tokens.glyph.more.up, up) : "",
    down ? moreText(tokens.glyph.more.down, down) : "",
  ]
    .filter(Boolean)
    .join(GAP);
  const more = line(text ? [span(" ".repeat(insetOf(l))), span(text, { role: "dim" })] : []);
  return [...lines, { ...more, spans: truncateSpans(more.spans, width) }];
}
