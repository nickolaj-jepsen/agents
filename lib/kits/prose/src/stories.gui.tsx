/** Prose's graphical stories: the props of `stories.ts`, drawn by `gui.tsx`. */
import type { GuiStories } from "@agents/kit-core/paint/gui.tsx";
import { prose } from "./gui.tsx";
import { proseExcerptProps, proseProps } from "./stories.ts";

export const proseGuiStories: GuiStories = {
  blocks: (g) => prose(g, proseProps.blocks.text, proseProps.blocks.options),
  excerpt: (g) => {
    const { Box } = g.els;
    return (
      <Box flexDirection="column" rowGap={1}>
        {prose(g, proseExcerptProps.folded.text, proseExcerptProps.folded.options)}
        {prose(g, proseExcerptProps.opened.text, proseExcerptProps.opened.options)}
      </Box>
    );
  },
  quiet: (g) => prose(g, proseProps.quiet.text, proseProps.quiet.options),
};
