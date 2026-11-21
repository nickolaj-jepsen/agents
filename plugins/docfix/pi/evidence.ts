/**
 * A suggestion's evidence as a person reads it, the pi half of `../claude/evidence.tsx`: each
 * piece under a dim rule that says when and who, its paragraphs at the full width of the pane,
 * the labelled ones named, and the citations as a list of what they point at instead of the
 * JSON an agent wrote them as. What is in the text is the core's (`readEvidence`).
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { clamp, fit, paint, tokens } from "../../../kit/legacy/pi/ui.ts";
import {
  evidenceBlocks,
  evidenceLabel,
  readEvidence,
  type Evidence,
  type EvidenceBlock,
} from "../core/docfix.ts";

/** Cells an entry's text is set in from its rule. */
const INDENT = 2;
/** Cells between a citation's kind and what it points at. */
const GAP = 2;

function lines(t: Theme, width: number, b: EvidenceBlock): string[] {
  const head = b.heading ? [paint(t, "dim", b.heading)] : [];
  if (!b.items) {
    return [
      ...head,
      ...b.lines.flatMap((line) => clamp(line, width)).map((l) => paint(t, "text", l)),
    ];
  }
  // The kinds sit in one dim column and what they point at hangs beside it.
  const kinds = Math.min(
    Math.max(...b.items.map((c) => visibleWidth(c.kind))),
    Math.max(4, Math.floor(width / 3)),
  );
  const room = Math.max(1, width - kinds - GAP);
  return [
    ...head,
    ...b.items.flatMap((c) =>
      clamp(c.kind === "quote" ? `“${c.value}”` : c.value, room).map(
        (line, i) =>
          (i === 0 ? paint(t, "dim", fit(c.kind, kinds)) : " ".repeat(kinds)) +
          " ".repeat(GAP) +
          paint(t, "text", line),
      ),
    ),
  ];
}

/** A piece's blocks, a blank row between them. */
const blocks = (t: Theme, width: number, e: Evidence) =>
  evidenceBlocks(readEvidence(e)).flatMap((b, n) => [
    ...(n > 0 ? [""] : []),
    ...lines(t, width, b),
  ]);

/**
 * The section's title. One piece of evidence has no rule of its own, so its date and author go
 * here instead of under a second rule right below the first.
 */
export function evidenceTitle(items: readonly Evidence[]): string {
  const only = items.length === 1 ? items[0] : undefined;
  return only ? `Evidence  ${evidenceLabel(readEvidence(only))}` : "Evidence";
}

/**
 * The evidence, newest first, one blank row between pieces. A single piece is set at the full
 * width under the section's title; several each get a dated rule and are indented under it.
 */
export function evidence(t: Theme, width: number, items: readonly Evidence[]): string[] {
  if (items.length === 1) {
    return blocks(t, width, items[0] as Evidence);
  }
  return [...items].reverse().flatMap((e, i) => {
    const view = readEvidence(e);
    const label = evidenceLabel(view);
    const rule = tokens.glyph.rule.repeat(Math.max(0, width - visibleWidth(label) - 1));
    const head = paint(t, "dim", rule ? `${label} ${rule}` : label);
    const body = blocks(t, Math.max(1, width - INDENT), e).map((l) =>
      l ? " ".repeat(INDENT) + l : l,
    );
    return [...(i > 0 ? [""] : []), head, ...body];
  });
}
