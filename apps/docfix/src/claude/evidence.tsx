/**
 * A suggestion's evidence as a person reads it: each piece under a dim label that says when and
 * who, its paragraphs at the full width of the room, the labelled ones named, and the
 * citations as a list of what they point at instead of the JSON an agent wrote them as.
 * What is in the text is the core's (`readEvidence`); this only says what goes where, and the
 * kit draws it for the surface.
 */
import { facts, indent, prose, rule, stack, subhead, type Kit } from "@agents/kit-legacy/claude/ui.tsx";
import {
  evidenceBlocks,
  evidenceLabel,
  readEvidence,
  type Evidence,
  type EvidenceBlock,
} from "../lib/docfix";

function block(k: Kit, b: EvidenceBlock, key: string): JSX.Element {
  const { Box } = k;
  if (b.items)
    return (
      <Box key={key} flexDirection="column">
        {facts(
          k,
          b.items.map((c) => ({
            label: c.kind,
            value: c.value,
            isQuote: c.kind === "quote",
            isCode: c.kind !== "quote",
          })),
          b.heading || undefined,
        )}
      </Box>
    );
  return (
    <Box key={key} flexDirection="column">
      {b.heading ? subhead(k, b.heading) : null}
      {prose(k, b.lines.join("\n"))}
    </Box>
  );
}

/**
 * The evidence, newest first: one piece has no label of its own, its age saying when; several
 * each get a dated label.
 */
export function evidence(k: Kit, items: readonly Evidence[]): JSX.Element {
  const { Box } = k;
  const isSingle = items.length === 1;
  return stack(
    k,
    [...items].reverse().map((e, i) => {
      const view = readEvidence(e);
      const blocks = (inner: Kit) =>
        stack(
          inner,
          evidenceBlocks(view).map((b, n) => block(inner, b, `p${n}`)),
          { gui: { gap: "sm" } },
        );
      return (
        <Box key={`ev${i}`} flexDirection="column">
          {isSingle ? null : rule(k, evidenceLabel(view))}
          {isSingle ? blocks(k) : indent(k, blocks)}
        </Box>
      );
    }),
    { gui: { gap: "sm" } },
  );
}
