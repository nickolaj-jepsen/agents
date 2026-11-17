/**
 * A suggestion's evidence as a person reads it, the pi half of `../claude/evidence.tsx`: each
 * piece under a dim rule that says when and who, its paragraphs at the full width of the pane,
 * the labelled ones named, and the citations as a list of what they point at instead of the
 * JSON an agent wrote them as. What is in the text is the core's (`readEvidence`).
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { clamp, fit, paint, tokens } from "../../../kit/pi/ui.ts";
import { readEvidence, type Evidence, type EvidencePart } from "../core/docfix.ts";

/** Cells an entry's text is set in from its rule. */
const INDENT = 2;
/** Cells between a citation's kind and what it points at. */
const GAP = 2;

function lines(t: Theme, width: number, p: EvidencePart): string[] {
  if (p.kind === "text") return clamp(p.text, width).map((l) => paint(t, "text", l));
  if (p.kind === "labelled")
    return [paint(t, "dim", p.label), ...clamp(p.text, width).map((l) => paint(t, "text", l))];
  // The kinds sit in one dim column and what they point at hangs beside it.
  const kinds = Math.min(
    Math.max(...p.items.map((c) => visibleWidth(c.kind))),
    Math.max(4, Math.floor(width / 3)),
  );
  const room = Math.max(1, width - kinds - GAP);
  return p.items.flatMap((c) =>
    clamp(c.kind === "quote" ? `“${c.value}”` : c.value, room).map(
      (line, i) =>
        (i === 0 ? paint(t, "dim", fit(c.kind, kinds)) : " ".repeat(kinds)) +
        " ".repeat(GAP) +
        paint(t, "text", line),
    ),
  );
}

/**
 * The evidence, newest first, one blank row between pieces.
 * @param width The room in cells.
 */
export function evidence(t: Theme, width: number, items: readonly Evidence[]): string[] {
  return [...items].reverse().flatMap((e, i) => {
    const view = readEvidence(e);
    const label = [view.when, view.by, view.isMigrated ? "migrated" : ""]
      .filter(Boolean)
      .join("  ");
    const rule = tokens.glyph.rule.repeat(Math.max(0, width - visibleWidth(label) - 1));
    const head = paint(t, "dim", rule ? `${label} ${rule}` : label);
    const body = view.parts.flatMap((p, n) => [
      ...(n > 0 ? [""] : []),
      ...lines(t, Math.max(1, width - INDENT), p).map((l) => " ".repeat(INDENT) + l),
    ]);
    return [...(i > 0 ? [""] : []), head, ...body];
  });
}
