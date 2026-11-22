/**
 * The catalogue's stage: a borderless, padding-free mount that draws exactly a component's
 * lines and nothing else, so a screenshot cropped to it shows only the component. Catalogue
 * only; the kit has no such thing. Frame stories (`frame: true`) keep the modal, since the
 * frame is what they show.
 */
import type { OverlayOptions } from "@earendil-works/pi-tui";
import { fit, tokens } from "@agents/kit-legacy/pi/ui.ts";
import type { Story } from "./stories.ts";

/** Top-left cell of the stage, in terminal cells. */
export const STAGE_AT = { row: 2, col: 2 };
/** Cells kept clear of the right edge, and rows of the bottom, so the crop is never clipped. */
const CLEAR = { right: 2, bottom: 2 };

const CAP: Record<string, number> = {
  reading: tokens.width.reading,
  split: tokens.width.split,
  dialog: tokens.width.dialog,
};

/** The stage's width on a terminal `columns` wide: the story's width class as a cap. */
export const stageWidth = (story: Pick<Story, "width">, columns: number) =>
  Math.max(1, Math.min(CAP[story.width] ?? Infinity, columns - STAGE_AT.col - CLEAR.right));

/** The most rows the stage shows on a terminal `rows` high. */
export const stageRows = (rows: number) => Math.max(1, rows - STAGE_AT.row - CLEAR.bottom);

/** Every line padded to `width` and cut to `rows`, so the stage is a solid known rectangle. */
export const stageLines = (lines: string[], width: number, rows: number) =>
  lines.slice(0, rows).map((l) => fit(l, width));

/** Static overlay options: the cap as the width; pi narrows it to the terminal on resize. */
export const stageOptions = (story: Pick<Story, "width">): OverlayOptions => ({
  row: STAGE_AT.row,
  col: STAGE_AT.col,
  width: CAP[story.width] ?? 1000,
  margin: { left: STAGE_AT.col, right: CLEAR.right, bottom: CLEAR.bottom },
});
