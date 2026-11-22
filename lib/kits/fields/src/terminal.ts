/** Fields as styled lines: the one drawing both terminals paint. */
import {
  block,
  cellWidth,
  line,
  literal,
  span,
  spansWidth,
  truncateSpans,
  type Line,
  type Role,
  type Span,
} from "@agents/kit-core/lines.ts";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { Field, FieldsOptions } from "./contract.ts";

const GAP = " ".repeat(tokens.gutter);

/** What a person can press: in the accent where the keyboard is, quiet elsewhere. */
const keyRole = (isActive = false): Role => (isActive ? "accent" : "dim");

const valueRole = (f: Field): Role => (f.empty && !f.hovered ? "dim" : "text");

const valueStyle = (f: Field) => ({ role: valueRole(f), bold: f.hovered || undefined });

/**
 * One value each, named: a row per field with its key, its label and what it holds, the labels
 * in one column; or, `inline`, the values side by side after their keys, wrapped whole. A field
 * with a `hit` is a control, its row or its cells.
 */
export function fields(all: readonly Field[], width: number, options: FieldsOptions = {}): Line[] {
  const { active, inline: isInline = false, valueLines = 2 } = options;
  const hasKeys = all.some((f) => f.key);
  if (isInline) {
    const rows: Line[] = [];
    let spans: Span[] = [];
    for (const f of all) {
      // Without a key to tell values apart, a quiet label does.
      const lead = f.key ?? f.label;
      const entry = truncateSpans(
        [
          span(lead, { role: f.key ? keyRole(active) : "dim", hit: f.hit }),
          span(" ", { hit: f.hit }),
          span(f.value, { ...valueStyle(f), hit: f.hit }),
        ],
        width,
      );
      if (spans.length && spansWidth(spans) + tokens.gutter + spansWidth(entry) > width) {
        rows.push(line(spans));
        spans = [];
      }
      if (spans.length) spans.push(span(GAP));
      spans.push(...entry);
    }
    if (spans.length) rows.push(line(spans));
    return rows;
  }
  const keyed = hasKeys ? Math.max(...all.map((f) => cellWidth(f.key ?? ""))) + tokens.gutter : 0;
  // The label column gives way before the value does: a narrow room keeps half for each.
  const widest = Math.max(0, ...all.map((f) => cellWidth(f.label)));
  const labelled = Math.min(widest, Math.max(4, Math.floor((width - keyed) / 2) - tokens.gutter));
  return all.flatMap((f) => {
    const label = truncateSpans([span(f.label, { role: "dim" })], labelled);
    const lead = [
      ...(hasKeys
        ? [span((f.key ?? "").padEnd(keyed - tokens.gutter), { role: keyRole(active) }), span(GAP)]
        : []),
      ...label,
      span(" ".repeat(labelled - spansWidth(label)) + GAP),
    ];
    return block(literal(f.value, valueStyle(f)), width, {
      lead,
      max: valueLines,
      hit: f.hit,
    });
  });
}
