/** The detail as styled lines: the one drawing both terminals paint. */
import { buttonRow } from "@agents/kit-buttons/terminal.ts";
import type { Button } from "@agents/kit-buttons/contract.ts";
import { fields } from "@agents/kit-fields/terminal.ts";
import { captionFrameLayout } from "@agents/kit-frame/contract.ts";
import { captionParts, captionRule } from "@agents/kit-frame/terminal.ts";
import {
  blank,
  block,
  inline,
  scrolled,
  span,
  type Line,
  type Scrolled,
  type Span,
} from "@agents/kit-core/lines.ts";
import { prose } from "@agents/kit-prose/terminal.ts";
import type { Detail, DetailItem, DetailSection } from "./contract.ts";

/** An action at a rule's end, drawn as a button row draws one. */
const actionSpans = (a: Button): Span[] => buttonRow([a], Number.MAX_SAFE_INTEGER)[0]?.spans ?? [];

/** `─ words ── words ──── action`: the frame's rule, its words dim, across the detail. */
function ruleRow(
  words: string | readonly string[],
  action: Button | undefined,
  width: number,
  tail = 0,
): Line {
  const parts = (typeof words === "string" ? [words] : words).filter(Boolean);
  return captionRule({
    width,
    caption: captionParts(parts.map((part) => [span(part, { role: "dim" })])),
    end: action ? actionSpans(action) : undefined,
    tail,
  });
}

/** Keyed rows: the keys in one dim column, each value wrapped beside its key. */
const itemRows = (items: readonly DetailItem[], width: number): Line[] =>
  fields(
    items.map((item) => ({
      label: item.key,
      value: item.isQuote ? `“${item.value}”` : item.value,
    })),
    width,
    { valueLines: Infinity },
  );

/** A row of text set in to where a framed detail's rules have their words. */
const setIn = (row: Line, by: number): Line =>
  by && row.spans.length ? { ...row, spans: [span(" ".repeat(by)), ...row.spans] } : row;

/** The cells a framed detail's text is set in by on each side: a frame's body's. */
const insetOf = (d: Detail) => (d.framed ? captionFrameLayout.x : 0);

function section(s: DetailSection, d: Detail, width: number): Line[] {
  const x = insetOf(d);
  const room = Math.max(1, width - 2 * x);
  return [
    // A framed rule ends in the cell of rule a frame's corner is, in line with the text's edge.
    ...(s.rule !== undefined ? [ruleRow(s.rule, s.action, width, x ? x - 1 : 0)] : []),
    ...[
      ...(s.heading ? block([span(s.heading, { role: "dim" })], room) : []),
      ...(s.text ? prose(s.text, room) : []),
      ...(s.items?.length ? itemRows(s.items, room) : []),
    ].map((row) => setIn(row, x)),
  ];
}

/** The title in one style, its code too: a title reads as one line of words, not as a mix of colours. */
const titleSpans = (title: string): Span[] =>
  inline(title, TITLE).map((sp) => (sp.role === "code" ? { ...TITLE, text: sp.text } : sp));

const TITLE = { role: "text", bold: true } as const;

/** Every row of the detail, uncut. */
function rowsOf(d: Detail, width: number): Line[] {
  const x = insetOf(d);
  const room = Math.max(1, width - 2 * x);
  const head = [
    ...(d.meta ? block([span(d.meta, { role: "dim", bold: d.hovered || undefined })], room) : []),
    ...(d.title ? block(titleSpans(d.title), room, { max: d.titleMax }) : []),
  ].map((row) => setIn(row, x));
  const parts = [head, ...(d.sections ?? []).map((s) => section(s, d, width))].filter(
    (part) => part.length > 0,
  );
  return parts.flatMap((part, i) => (i ? [blank(), ...part] : part));
}

/** Below this many rows a cut detail has no room to say so: its rows are all text. */
const MARKED = 3;

/** The window a detail's height shows of its rows, from `offset`. */
function windowOf(d: Detail, all: readonly Line[]): Scrolled<Line> {
  const height = d.height ?? Infinity;
  if (all.length <= height) return { rows: [...all], top: 0, max: 0 };
  if (height < MARKED) {
    const max = all.length - height;
    const top = Math.max(0, Math.min(max, d.offset ?? 0));
    return { rows: all.slice(top, top + height), top, max };
  }
  return scrolled(all, { rows: height, top: d.offset, inset: insetOf(d) });
}

/** The furthest `offset` can scroll a detail at `width`: 0 when it fits its height. */
export const detailRange = (d: Detail, width: number): number => windowOf(d, rowsOf(d, width)).max;

/**
 * One item read whole: a dim meta line, a bold title, then sections, each under a dim heading
 * or a rule, of prose and of keyed rows, a blank row between. Taller than `height`, it is a
 * window from `offset`, and where it has three rows or more its edges count what is out of sight
 * (`↑ 3 more`, `↓ 12 more`), as every window in the kit does.
 */
export function detail(d: Detail, width: number): Line[] {
  const { rows } = windowOf(d, rowsOf(d, width));
  if (d.hit === undefined) return rows;
  return rows.map((row) => (row.spans.some((s) => s.hit) ? row : { ...row, hit: d.hit }));
}
