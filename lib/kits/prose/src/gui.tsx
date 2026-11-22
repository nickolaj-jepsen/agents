/** Prose on the graphical surfaces: the host's own `Markdown`, as it draws a reply. */
import { cellWidth, inline } from "@agents/kit-core/lines.ts";
import type { Gui } from "@agents/kit-core/paint/gui.tsx";
import { spans } from "@agents/kit-core/paint/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { ProseOptions } from "./contract.ts";

/**
 * A text of several blocks, at the inset every block of a pane has. The host sets it and wraps
 * it; the surface scrolls, so there is no window.
 * @param text Prose or Markdown.
 * @param options `excerpt` folds a long passage to its first line with a `More` Button.
 */
export function prose(g: Gui, text: string, { isDim, excerpt }: ProseOptions = {}): JSX.Element {
  const { Box, Button, Markdown, Text } = g.els;
  const { across, space } = tokens.gui;
  const words = <Markdown text={text} dimColor={isDim || undefined} />;
  const isLong = text.includes("\n") || cellWidth(text) > tokens.gui.excerptCells;
  if (!excerpt || !isLong) return <Box paddingX={across.inset}>{words}</Box>;
  const { hit, isOpen } = excerpt;
  const toggle = (
    <Button key={hit} dimColor label={isOpen ? "Less" : "More"} onPress={() => g.press?.(hit)} />
  );
  if (!isOpen)
    return (
      <Box
        flexDirection="row"
        flexWrap="nowrap"
        alignItems="center"
        columnGap={across.md}
        paddingX={across.inset}
      >
        <Box flexGrow={1} flexShrink={1} width={0}>
          <Text dimColor wrap="truncate-end">
            {spans(g, inline(text.replace(/\s*\n\s*/g, " ")))}
          </Text>
        </Box>
        <Box flexShrink={0}>{toggle}</Box>
      </Box>
    );
  return (
    <Box
      flexDirection="column"
      rowGap={space.sm}
      paddingX={across.inset}
      paddingY={space.sm}
      backgroundColor={tokens.gui.fill}
      // A round border is the surface's only rounded corner; it is drawn in no colour.
      borderStyle="round"
      borderColor="#00000000"
    >
      {words}
      <Box flexDirection="row" justifyContent="flex-end">
        {toggle}
      </Box>
    </Box>
  );
}
