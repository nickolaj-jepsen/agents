/** Prose on the graphical surfaces: the host's own `Markdown`, as it draws a reply. */
import { inline } from "@agents/kit-core/lines.ts";
import { panel, spans, type Gui, type GuiSurface } from "@agents/kit-core/paint/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { ProseProps } from "./contract.ts";
import { view } from "./model.ts";

/** What `prose` is given on a graphical surface; a field only a terminal has is not in it. */
export type ProseGui = ProseProps<GuiSurface>;

/**
 * A text of several blocks, at the inset every block of a pane has. The host sets it and wraps
 * it; the surface scrolls, so there is no window. An `excerpt` folds a long passage to its first
 * line with a `More` Button.
 */
export function prose(g: Gui, p: ProseGui): JSX.Element {
  const { Box, Button, Markdown, Text } = g.els;
  const { across } = tokens.gui;
  const v = view(p, g.surface);
  const words = <Markdown text={p.text} dimColor={v.isDim || undefined} />;
  if (v.shape === "whole" || !p.excerpt) return <Box paddingX={across.inset}>{words}</Box>;
  const { hit } = p.excerpt;
  const toggle = (
    <Button
      key={hit}
      dimColor
      label={v.shape === "opened" ? "Less" : "More"}
      onPress={() => g.press?.(hit)}
    />
  );
  if (v.shape === "folded")
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
            {spans(g, inline(v.first ?? ""))}
          </Text>
        </Box>
        <Box flexShrink={0}>{toggle}</Box>
      </Box>
    );
  return panel(
    g,
    {},
    words,
    <Box flexDirection="row" justifyContent="flex-end">
      {toggle}
    </Box>,
  );
}
