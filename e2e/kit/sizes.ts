/**
 * The catalogue's snapshot sizes, the same in both harnesses so a story's renders pair up.
 * The narrow one is tall: Claude Code gives an inline pane about a third of the terminal's
 * rows, and at 24 rows that shows six lines of any component.
 */
import type { Size } from "../lib/session.ts";

const NARROW: Size = [70, 60];

export const catalogueSizes = (extreme: boolean): Size[] =>
  extreme ? [NARROW, [112, 32], [160, 45], [240, 60]] : [NARROW, [160, 45]];
