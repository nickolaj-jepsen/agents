/** Prose's contract: a text of several blocks. Its window is `scrolled` in `lines.ts`. No host imports. */

export type ProseOptions = {
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
