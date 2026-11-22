/**
 * A suggestion's evidence as sections of the kit's `detail`: each piece under a dim rule that says
 * when and who, its paragraphs under their headings, and the citations as keyed rows instead of
 * the JSON an agent wrote them as. What is in the text is the core's (`readEvidence`); this only
 * says what goes where, and the kit draws it.
 */
import type { DetailSection } from "@agents/kit-detail/contract.ts";
import { evidenceBlocks, evidenceLabel, readEvidence, type Evidence } from "../lib/docfix";

/**
 * The evidence, newest first: one piece under a rule that says `Evidence`, the row's meta line
 * saying how old it is; several each start under a dated rule.
 */
export function evidenceSections(items: readonly Evidence[]): DetailSection[] {
  const isSingle = items.length === 1;
  return [...items].reverse().flatMap((e) => {
    const view = readEvidence(e);
    const sections: DetailSection[] = evidenceBlocks(view).map((b) => ({
      heading: b.heading || undefined,
      text: b.lines.join("\n") || undefined,
      items: b.items?.map((c) => ({ key: c.kind, value: c.value, isQuote: c.kind === "quote" })),
    }));
    const rule = isSingle ? "Evidence" : evidenceLabel(view);
    // A piece with nothing to read still says it was filed.
    if (sections.length === 0) return [{ rule }];
    return sections.map((s, i) => (i === 0 ? { ...s, rule } : s));
  });
}
