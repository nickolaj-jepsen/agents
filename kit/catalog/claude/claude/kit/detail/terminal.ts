/** The detail as styled lines: the one drawing both terminals paint. */
import { controlStyle } from "../card/terminal.ts";
import {
  blank,
  block,
  cellWidth,
  fit,
  inline,
  line,
  literal,
  span,
  spansWidth,
  truncateSpans,
  type Line,
  type Span,
} from "../lines.ts";
import { tokens } from "../tokens.ts";
import type { Detail, DetailAction, DetailItem, DetailSection } from "./contract.ts";

const GAP = " ".repeat(tokens.gutter);

/** An action at a rule's end: its label, then its key dim, as a button row draws one. */
function actionSpans(a: DetailAction): Span[] {
  return [
    span(a.label, {
      ...(a.isDim ? { role: "dim" as const } : controlStyle({ highlighted: a.hovered })),
      hit: a.hit,
    }),
    span(" ", { hit: a.hit }),
    span(`[${a.hotkey}]`, { role: "dim", hit: a.hit }),
  ];
}

/** `words ── action`: a rule across the row, the words at its start and the action at its end. */
function ruleRow(words: string, action: DetailAction | undefined, width: number): Line {
  const end = action ? actionSpans(action) : [];
  const room = width - spansWidth(end) - (end.length ? 1 : 0);
  const head = truncateSpans([span(words, { role: "dim" })], Math.max(0, room - 2));
  const rule = room - spansWidth(head) - 1;
  const spans = [
    ...head,
    ...(rule > 0
      ? [span(" "), span(tokens.glyph.rule.repeat(rule), { role: "border" })]
      : [span(" ".repeat(Math.max(0, room - spansWidth(head))))]),
    ...(end.length ? [span(" "), ...end] : []),
  ];
  return line(truncateSpans(spans, width));
}

/** Keyed rows: the keys in one dim column, each value wrapped beside its key. */
function itemRows(items: readonly DetailItem[], width: number): Line[] {
  const keys = Math.min(
    Math.max(...items.map((item) => cellWidth(item.key))),
    Math.max(4, Math.floor(width / 3)),
  );
  const hang = [span(" ".repeat(keys + tokens.gutter))];
  return items.flatMap((item) =>
    block(literal(item.isQuote ? `“${item.value}”` : item.value, { role: "text" }), width, {
      lead: [span(fit(item.key, keys), { role: "dim" }), span(GAP)],
      hang,
    }),
  );
}

function section(s: DetailSection, width: number): Line[] {
  return [
    ...(s.rule !== undefined ? [ruleRow(s.rule, s.action, width)] : []),
    ...(s.heading ? block([span(s.heading, { role: "dim" })], width) : []),
    ...(s.text ? s.text.split("\n").flatMap((p) => block(inline(p), width)) : []),
    ...(s.items?.length ? itemRows(s.items, width) : []),
  ];
}

/** The title in one style, its code too: a title reads as one line of words, not as a mix of colours. */
const titleSpans = (title: string): Span[] =>
  inline(title, TITLE).map((sp) => (sp.role === "code" ? { ...TITLE, text: sp.text } : sp));

const TITLE = { role: "text", bold: true } as const;

/** Every row of the detail, uncut. */
function rowsOf(d: Detail, width: number): Line[] {
  const head = [
    ...(d.meta ? block([span(d.meta, { role: "dim", bold: d.hovered || undefined })], width) : []),
    ...(d.title ? block(titleSpans(d.title), width, { max: d.titleMax }) : []),
  ];
  const parts = [head, ...(d.sections ?? []).map((s) => section(s, width))].filter(
    (part) => part.length > 0,
  );
  return parts.flatMap((part, i) => (i ? [blank(), ...part] : part));
}

/** Below this many rows a cut detail has no room to say so: its rows are all text. */
const MARKED = 3;

const more = (glyph: string): Line => line([span(`${glyph} more`, { role: "dim" })]);

/** The furthest `offset` can scroll a detail at `width`: 0 when it fits its height. */
export function detailRange(d: Detail, width: number): number {
  const all = rowsOf(d, width).length;
  const height = d.height ?? Infinity;
  if (all <= height) return 0;
  return Math.max(0, all - height + (height < MARKED ? 0 : 1));
}

/**
 * One item read whole: a dim meta line, a bold title, then sections, each under a dim heading
 * or a rule, of prose and of keyed rows, a blank row between. Taller than `height`, it is cut,
 * and a dim `↑ more` and `↓ more` say what is out of sight, where it has three rows or more.
 */
export function detail(d: Detail, width: number): Line[] {
  const all = rowsOf(d, width);
  const height = d.height ?? Infinity;
  let rows = all;
  if (all.length > height) {
    const offset = Math.max(0, Math.min(detailRange(d, width), d.offset ?? 0));
    const isMarked = height >= MARKED;
    const isTop = offset > 0 && isMarked;
    let room = height - (isTop ? 1 : 0);
    const isBottom = isMarked && offset + room < all.length;
    if (isBottom) room -= 1;
    rows = [
      ...(isTop ? [more(tokens.glyph.more.up)] : []),
      ...all.slice(offset, offset + Math.max(0, room)),
      ...(isBottom ? [more(tokens.glyph.more.down)] : []),
    ].slice(0, height);
  }
  if (d.hit === undefined) return rows;
  return rows.map((row) => (row.spans.some((s) => s.hit) ? row : { ...row, hit: d.hit }));
}
