/** The list as styled lines: the one drawing both terminals paint. */
import { controlStyle, rail } from "../card/terminal.ts";
import {
  cellWidth,
  ELLIPSIS,
  inline,
  line,
  span,
  spansWidth,
  truncateSpans,
  type Line,
  type Span,
  type Style,
} from "../lines.ts";
import { tokens } from "../tokens.ts";
import type { List, ListGroup, ListRange, ListRow } from "./contract.ts";

const GAP = " ".repeat(tokens.gutter);

/** Cells the rail and its gap take: where a group's label and a row's pointer start. */
export const LIST_INSET = cellWidth(tokens.glyph.rail) + tokens.gutter;

/** Cells before a row's text: the pointer column, the mark and a space. */
const LEAD = cellWidth(tokens.glyph.pointer) + 1 + cellWidth(tokens.glyph.single.off) + 1;

/** A row keeps its aside while its text still has this many cells beside it. */
const ASIDE_ROOM = 40;

/**
 * Cells a row's text has at `width`, beside an aside as wide as `aside` (none for 0): what a
 * caller reads to know whether the list shows a text whole. An aside is dropped first when the
 * text would have fewer than `ASIDE_ROOM` cells.
 */
export function listTextRoom(width: number, aside = 0): number {
  const room = width - LIST_INSET - LEAD;
  const beside = room - aside - tokens.gutter;
  return aside > 0 && beside >= ASIDE_ROOM ? beside : room;
}

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

/** `left` and `right` on one row of `width` cells, `right` at its end. */
function spread(left: Span[], right: Span[], width: number): Span[] {
  const room = width - spansWidth(right) - (right.length ? tokens.gutter : 0);
  const cut = truncateSpans(left, Math.max(0, room));
  const pad = width - spansWidth(cut) - spansWidth(right);
  return right.length ? [...cut, span(" ".repeat(Math.max(1, pad))), ...right] : cut;
}

/** A group's row: its label, cut from the left, and its count at the right. */
function groupRow(g: ListGroup, width: number): Line {
  const room = width - LIST_INSET;
  const count = g.count ? [span(g.count, { role: "dim" })] : [];
  const labelRoom = room - (g.count ? cellWidth(g.count) + tokens.gutter : 0);
  const label = span(cutLeft(g.label, Math.max(1, labelRoom)), {
    role: g.active ? "accent" : "dim",
  });
  return rail({ active: g.active, answered: g.done }, line(spread([label], count, room), g.hit));
}

/** One row: the pointer column, the mark, the text cut to the row, the aside at the right. */
function itemRow(r: ListRow, g: ListGroup, width: number): Line {
  const mark = r.mark ?? "open";
  const isLit = r.focused || r.hovered;
  const words: Style =
    mark === "dropped"
      ? { role: "dim", bold: isLit || undefined }
      : controlStyle({ primary: mark === "chosen", highlighted: isLit });
  const glyph =
    mark === "chosen"
      ? span(tokens.glyph.single.on, { role: "accent", bold: true })
      : mark === "dropped"
        ? span(tokens.glyph.dropped, { role: "dim" })
        : span(tokens.glyph.single.off, { role: "dim" });
  const pointer = r.focused
    ? [span(tokens.glyph.pointer, { role: "text", bold: true }), span(" ")]
    : [span(" ".repeat(cellWidth(tokens.glyph.pointer) + 1))];
  const room = width - LIST_INSET;
  const aside = r.aside ?? "";
  const textRoom = listTextRoom(width, cellWidth(aside));
  const isAside = aside !== "" && textRoom < room - LEAD;
  // Code keeps the row's style: a row's colour is what it is set to, across its whole label.
  const spans = inline(r.text, words).map((sp) =>
    sp.role === "code" ? { ...words, text: sp.text } : sp,
  );
  const text = truncateSpans(spans, textRoom);
  const left = [...pointer, glyph, span(" "), ...text];
  const right = isAside ? [span(aside, { role: "dim" })] : [];
  return rail({ active: g.active, answered: g.done }, line(spread(left, right, room), r.hit));
}

type Entry = { group: number; row?: number };

/** The group and row of each line of the list drawn whole. */
const entriesOf = (groups: readonly ListGroup[]): Entry[] =>
  groups.flatMap((g, group) => [{ group }, ...g.rows.map((_, row) => ({ group, row }))]);

/**
 * The entries a window from `start` shows in `rows`: its group's row first, when `start` is a row
 * and there is room for one over it.
 */
function shown(entries: readonly Entry[], start: number, rows: number): Entry[] {
  const first = entries[start];
  const out: Entry[] = first?.row !== undefined && rows > 1 ? [{ group: first.group }] : [];
  for (let i = start; i < entries.length && out.length < rows; i++) out.push(entries[i]!);
  return out;
}

type Window = { start: number; base: number; last: number; rows: number };

/** Where the window stands: `start` is the first entry under the sticky group row. */
function windowOf(list: List, entries: readonly Entry[]): Window | undefined {
  const height = list.height ?? Infinity;
  if (entries.length <= height) return undefined;
  // The last row says what is hidden, but in a window of one row, which is the keyboard's alone.
  const rows = height <= 1 ? 1 : height - 1;
  const isAt = (e: Entry, at: Entry) => e.group === at.group && e.row === at.row;
  const focusAt = entries.findIndex((e) => list.groups[e.group]?.rows[e.row ?? -1]?.focused);
  const active = list.groups.findIndex((g) => g.active);
  const group = active >= 0 ? active : (entries[focusAt]?.group ?? 0);
  const fits = (start: number) =>
    focusAt < 0 || shown(entries, start, rows).some((e) => isAt(e, entries[focusAt]!));
  // The furthest the window goes: the earliest start that still shows the list's last row.
  const end = entries[entries.length - 1]!;
  const showsEnd = (start: number) => shown(entries, start, rows).some((e) => isAt(e, end));
  let last = entries.length - 1;
  while (last > 0 && showsEnd(last - 1)) last--;
  const head = entries.findIndex((e) => e.group === group && e.row === undefined);
  let base = Math.min(last, rows > 1 || focusAt < 0 ? head : focusAt);
  while (base < focusAt && !fits(base)) base++;
  const start = Math.max(0, Math.min(last, base + (list.scroll ?? 0)));
  return { start, base, last, rows };
}

const plural = (n: number, [one, many]: readonly [string, string]) =>
  `${n} ${n === 1 ? one : many}`;

/** The row under a window: what it hides above and below. */
function moreRow(list: List, entries: readonly Entry[], drawn: Entry[], start: number): Line {
  const noun = list.noun ?? ["group", "groups"];
  const end = drawn[drawn.length - 1];
  const sticky = entries[start]?.row !== undefined ? entries[start]?.group : undefined;
  const above = entries.slice(0, start);
  const rowsAbove = above.filter((e) => e.group === sticky && e.row !== undefined).length;
  const groupsAbove = new Set(above.filter((e) => e.group !== sticky).map((e) => e.group)).size;
  const endAt = end ? entries.findIndex((e) => e.group === end.group && e.row === end.row) : -1;
  const below = entries.slice(endAt + 1);
  const rowsBelow = below.filter((e) => e.group === end?.group).length;
  const groupsBelow = below.filter((e) => e.row === undefined).length;
  const up = [
    rowsAbove ? `${rowsAbove} more here` : "",
    groupsAbove ? `${plural(groupsAbove, noun)} above` : "",
  ].filter(Boolean);
  const down = [
    rowsBelow ? `${rowsBelow} more here` : "",
    groupsBelow ? `${groupsBelow} more ${groupsBelow === 1 ? noun[0] : noun[1]}` : "",
  ].filter(Boolean);
  const text = [
    up.length ? `${tokens.glyph.more.up} ${up.join(" · ")}` : "",
    down.length ? `${tokens.glyph.more.down} ${down.join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join(GAP);
  return line(text ? [span(" ".repeat(LIST_INSET)), span(text, { role: "dim" })] : []);
}

/**
 * Groups of rows behind the card's rail: each group's row (its label, its count), then a row
 * per item with its mark and one line of text. Taller than `height`, it is a window that keeps
 * the keyboard's group row at its top and says on its last row what it hides.
 */
export function list(l: List, width: number): Line[] {
  const entries = entriesOf(l.groups);
  const draw = (e: Entry): Line => {
    const g = l.groups[e.group]!;
    const r = e.row === undefined ? undefined : g.rows[e.row];
    return r ? itemRow(r, g, width) : groupRow(g, width);
  };
  const w = windowOf(l, entries);
  if (!w) return entries.map(draw);
  const drawn = shown(entries, w.start, w.rows);
  if (w.rows >= (l.height ?? 0)) return drawn.map(draw);
  const more = moreRow(l, entries, drawn, w.start);
  return [...drawn.map(draw), { ...more, spans: truncateSpans(more.spans, width) }];
}

/** How far `scroll` can move a list's window each way from where the keyboard puts it. */
export function listRange(l: List): ListRange {
  const w = windowOf({ ...l, scroll: 0 }, entriesOf(l.groups));
  return w ? { min: 0 - w.base, max: w.last - w.base } : { min: 0, max: 0 };
}

/** Whether a row shows all of `text` at `width`, beside `aside`: else a caller shows it whole elsewhere. */
export const listShowsWhole = (text: string, width: number, aside = "") =>
  spansWidth(inline(text)) <= listTextRoom(width, cellWidth(aside));
