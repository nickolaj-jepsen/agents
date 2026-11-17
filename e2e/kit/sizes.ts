/**
 * The catalogue's snapshot sizes, the same in both harnesses so a story's renders pair up. The
 * narrow one is tall: Claude Code gives an inline pane about a third of the rows.
 */
import type { Size } from "../lib/session.ts";

const NARROW: Size = [70, 60];

export const catalogueSizes = (extreme: boolean): Size[] =>
  extreme ? [NARROW, [112, 32], [160, 45], [240, 60]] : [NARROW, [160, 45]];
