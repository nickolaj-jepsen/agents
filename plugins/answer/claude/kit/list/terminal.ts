/** The list as styled lines: the one drawing both terminals paint. */
import { controlStyle, rail } from "../card/terminal.ts";
import {
  blank,
  cellWidth,
  ELLIPSIS,
  hitSpans,
  inline,
  line,
  span,
  spansWidth,
  truncate,
  truncateSpans,
  type Line,
  type Span,
  type Style,
} from "../lines.ts";
import { tokens } from "../tokens.ts";
import type { List, ListAction, ListGroup, ListRow } from "./contract.ts";

const GAP = " ".repeat(tokens.gutter);

/** Cells the rail and its gap take: where a group's label and a row's pointer start. */
export const LIST_INSET = cellWidth(tokens.glyph.rail) + tokens.gutter;

/** Cells before a row's text: the pointer column, the mark and a space. */
const LEAD = cellWidth(tokens.glyph.pointer) + 1 + cellWidth(tokens.glyph.single.off) + 1;

/** Cells a group's label keeps beside its controls. */
const MIN_LABEL = 10;

/** Between a flat row's group label and its text. */
const SEPARATOR = " › ";

/** Cells a row's text has at `width`, beside an aside column `aside` cells wide (none for 0). */
export function listTextRoom(width: number, aside = 0): number {
  return Math.max(1, width - LIST_INSET - LEAD - (aside > 0 ? aside + tokens.gutter : 0));
}

/** Whether a row shows all of `text` at `width`, beside its aside column: else show it elsewhere. */
export const listShowsWhole = (text: string, width: number, aside = 0) =>
  spansWidth(inline(text)) <= listTextRoom(width, aside);

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

const actionSpans = (actions: readonly ListAction[]): Span[] =>
  actions.flatMap((a, i) => [
    ...(i ? [span(GAP)] : []),
    span(a.label, { role: a.hovered ? "text" : "dim", bold: a.hovered || undefined, hit: a.hit }),
  ]);

/** A group's row: its label, cut from the left, and its controls at the right. */
function groupRow(g: ListGroup, width: number): Line {
  const room = width - LIST_INSET;
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
  return rail(
    { active: g.active, answered: g.done },
    line(spans, actions.length ? undefined : g.hit),
  );
}

/** One row: the pointer column, the mark, the text cut to the row, the aside at the right. */
function itemRow(r: ListRow, g: ListGroup, l: List, width: number): Line {
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
  const aside = l.aside ?? 0;
  const textRoom = listTextRoom(width, aside);
  // Code keeps the row's style: a row's colour is what it is set to, across its whole label.
  let spans = inline(r.text, words).map((sp) =>
    sp.role === "code" ? { ...words, text: sp.text } : sp,
  );
  if (l.flat) {
    const label = shortLabel(g.label, Math.max(4, Math.floor(textRoom / 3)));
    spans = [span(label, { role: "dim" }), span(SEPARATOR, { role: "dim" }), ...spans];
  }
  const text = truncateSpans(spans, textRoom);
  const lead = [...pointer, glyph, span(" ")];
  const right =
    aside > 0
      ? [
          span(truncate(r.aside ?? "", aside).padStart(aside), {
            role: r.aside ? "dim" : undefined,
          }),
        ]
      : [];
  const body = spread(text, right, room - spansWidth(lead));
  const state = { active: g.active, answered: g.done };
  if (r.markHit === undefined) return rail(state, line([...lead, ...body], r.hit));
  return rail(
    state,
    line([...hitSpans(lead, r.markHit), ...(r.hit ? hitSpans(body, r.hit) : body)]),
  );
}

type Entry = { group: number; row?: number };

/** The group and row of each line of the list drawn whole. */
const entriesOf = (l: List): Entry[] =>
  l.groups.flatMap((g, group) => [
    ...(l.flat ? [] : [{ group }]),
    ...g.rows.map((_, row) => ({ group, row })),
  ]);

const isFocused = (l: List, e: Entry) =>
  e.row !== undefined && Boolean(l.groups[e.group]?.rows[e.row]?.focused);

type Window = { top: number; rows: number; max: number };

/** The window's rows, its more-row aside, and the furthest its top goes; none when all fits. */
function windowOf(l: List, entries: readonly Entry[]): Window | undefined {
  const height = l.height ?? Infinity;
  if (entries.length <= height) return undefined;
  // Three rows and more keep the last to say what is hidden.
  const rows = height >= 3 ? height - 1 : Math.max(1, height);
  const max = Math.max(0, entries.length - rows);
  return { top: Math.max(0, Math.min(max, l.top ?? 0)), rows, max };
}

/**
 * The top a window takes so the keyboard's row stays in it with `context` rows on either side:
 * it moves only as far as that needs, and not at all while the row is well inside.
 */
export function listFollow(l: List, context = 2): number {
  const entries = entriesOf(l);
  const w = windowOf(l, entries);
  if (!w) return 0;
  const at = entries.findIndex((e) => isFocused(l, e));
  if (at < 0) return w.top;
  const ctx = Math.min(context, Math.floor((w.rows - 1) / 2));
  let top = w.top;
  if (at < top + ctx) top = at - ctx;
  else if (at > top + w.rows - 1 - ctx) top = at - (w.rows - 1 - ctx);
  return Math.max(0, Math.min(w.max, top));
}

/**
 * Rows the list takes drawn whole: one a line, and with `space` a blank row between groups when
 * all of them fit its height.
 */
export function listRows(l: List): number {
  const lines = entriesOf(l).length;
  const gaps = l.space && !l.flat ? Math.max(0, l.groups.length - 1) : 0;
  return gaps && lines + gaps <= (l.height ?? Infinity) ? lines + gaps : lines;
}

/** The furthest a window's `top` goes: 0 for a list drawn whole. */
export function listTopMax(l: List): number {
  return windowOf(l, entriesOf(l))?.max ?? 0;
}

/** `5 in 2 docs`: rows, and the groups they are in. */
function hidden(entries: readonly Entry[], noun: readonly [string, string]) {
  const rows = entries.filter((e) => e.row !== undefined);
  if (!rows.length) return "";
  const groups = new Set(rows.map((e) => e.group)).size;
  return `${rows.length} in ${groups} ${groups === 1 ? noun[0] : noun[1]}`;
}

/**
 * Groups of rows behind the card's rail: each group's row, then a row per item with its mark and
 * one line of text. Taller than `height`, it is a window from `top`: the keyboard's group row
 * stands in for its first row when it is above the window, a group row is never its last, and its
 * last row says what it hides above and below.
 */
export function list(l: List, width: number): Line[] {
  const entries = entriesOf(l);
  const draw = (e: Entry): Line => {
    const g = l.groups[e.group]!;
    const r = e.row === undefined ? undefined : g.rows[e.row];
    return r ? itemRow(r, g, l, width) : groupRow(g, width);
  };
  const w = windowOf(l, entries);
  if (!w) {
    const rows = entries.map(draw);
    if (listRows(l) === entries.length) return rows;
    return rows.flatMap((row, i) =>
      i > 0 && entries[i]?.row === undefined ? [blank(), row] : [row],
    );
  }
  const slots = entries.slice(w.top, w.top + w.rows);
  const shown: (Entry | undefined)[] = [...slots];
  const at = entries.findIndex((e) => isFocused(l, e));
  const head = entries.findIndex((e) => e.row === undefined && e.group === entries[at]?.group);
  const stands = w.rows > 1 && head >= 0 && head < w.top && at > w.top && at < w.top + w.rows;
  if (stands) shown[0] = entries[head];
  const lastAt = shown.length - 1;
  if (w.rows > 1 && shown[lastAt]?.row === undefined) shown[lastAt] = undefined;
  const lines = shown.map((e) => (e ? draw(e) : blank()));
  if (w.rows >= (l.height ?? 0)) return lines;
  const noun = l.noun ?? ["group", "groups"];
  const visible = new Set(shown.filter((e): e is Entry => !!e).map((e) => entries.indexOf(e)));
  const above = entries.filter((e, i) => i < w.top + (stands ? 1 : 0) && !visible.has(i));
  const below = entries.slice(w.top + w.rows);
  const up = hidden(above, noun);
  const down = hidden(below, noun);
  const text = [
    up ? `${tokens.glyph.more.up} ${up}` : "",
    down ? `${tokens.glyph.more.down} ${down}` : "",
  ]
    .filter(Boolean)
    .join(GAP);
  const more = line(text ? [span(" ".repeat(LIST_INSET)), span(text, { role: "dim" })] : []);
  return [...lines, { ...more, spans: truncateSpans(more.spans, width) }];
}
