/** Prose's contract: a text of several blocks. Its window is `scrolled` in `lines.ts`. No host imports. */
import { modelFields } from "@agents/kit-core/manifest.ts";
import type { Props, Surface } from "@agents/kit-core/surfaces.ts";

/**
 * Prose's model: a text of several blocks.
 */
export type Prose = {
  /** Prose or Markdown. */
  text: string;
  /** The room in cells. */
  width: number;
  /** Every word quiet: a text beside the main one. */
  isDim?: boolean;
  /**
   * A passage that gives way to what follows it: a graphical surface shows its first line dim,
   * cut at the edge, with a quiet `More` for `hit`, and opened (`isOpen`) the whole passage in a
   * well with `Less`. A passage of one short line is drawn whole. A terminal draws every
   * passage whole, since its rows are the pane's.
   */
  excerpt?: { hit: string; isOpen: boolean };
};

/** The capability each gated field needs. The rest of the model is for every surface. */
export const proseNeeds = { width: "cells", excerpt: "cells:false" } as const;

export const proseFields = modelFields<Prose>()(["text", "width", "isDim", "excerpt"]);

/** Prose as `On` surfaces are given it: a field a surface cannot draw is not in its type. */
export type ProseProps<On extends Surface> = Props<Prose, typeof proseNeeds, On>;

/** What `prose` is given on a terminal. */
export type ProseTerminal = ProseProps<"pi" | "claude-terminal">;
