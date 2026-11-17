/**
 * A suggestion's evidence as a person reads it: each piece under a dim rule that says when and
 * who, its paragraphs at the full width of the pane, the labelled ones named, and the
 * citations as a list of what they point at instead of the JSON an agent wrote them as.
 * What is in the text is the core's (`readEvidence`); this only draws it.
 */
import { cellWidth, clamp, fit, tokens, type Kit } from "./ui";
import {
  evidenceBlocks,
  evidenceLabel,
  readEvidence,
  type Evidence,
  type EvidenceBlock,
} from "../core/docfix";

/** Cells an entry's text is set in from its rule. */
const INDENT = 2;
/** Cells between a citation's kind and what it points at. */
const GAP = 2;

function block(k: Kit, width: number, b: EvidenceBlock, key: string): JSX.Element {
  const { Box, Text } = k;
  const head = b.heading ? <Text dimColor>{b.heading}</Text> : null;
  if (!b.items)
    return (
      <Box key={key} flexDirection="column">
        {head}
        <Text>{b.lines.flatMap((line) => clamp(line, width)).join("\n")}</Text>
      </Box>
    );
  // The kinds sit in one dim column and what they point at hangs beside it, so a list of
  // paths is read down its right edge.
  const kinds = Math.min(
    Math.max(...b.items.map((c) => cellWidth(c.kind))),
    Math.max(4, Math.floor(width / 3)),
  );
  const room = Math.max(1, width - kinds - GAP);
  return (
    <Box key={key} flexDirection="column">
      {head}
      <Text>
        {b.items.flatMap((c, i) => {
          const value = c.kind === "quote" ? `“${c.value}”` : c.value;
          const [first = "", ...rest] = clamp(value, room);
          return [
            i > 0 ? "\n" : "",
            <Text key={`k${i}`} dimColor>
              {fit(c.kind, kinds)}
            </Text>,
            `${" ".repeat(GAP)}${first}`,
            ...rest.map((line) => `\n${" ".repeat(kinds + GAP)}${line}`),
          ];
        })}
      </Text>
    </Box>
  );
}

/**
 * The evidence, newest first, one blank row between pieces. One piece has no rule of its own:
 * the row's age says when. Several each get a dated rule.
 * @param width The room in cells.
 */
export function evidence(k: Kit, width: number, items: readonly Evidence[]): JSX.Element {
  const { Box, Text } = k;
  const isSingle = items.length === 1;
  return (
    <Box flexDirection="column" rowGap={1}>
      {[...items].reverse().map((e, i) => {
        const view = readEvidence(e);
        const label = evidenceLabel(view);
        const rule = tokens.glyph.rule.repeat(Math.max(0, width - cellWidth(label) - 1));
        const room = Math.max(1, width - (isSingle ? 0 : INDENT));
        return (
          <Box key={`ev${i}`} flexDirection="column">
            {isSingle ? null : <Text dimColor>{rule ? `${label} ${rule}` : label}</Text>}
            <Box flexDirection="column" rowGap={1} paddingLeft={isSingle ? 0 : INDENT}>
              {evidenceBlocks(view).map((b, n) => block(k, room, b, `p${n}`))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
