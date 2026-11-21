/** The sheet's contract. No host imports. */
import type { CaptionFrame } from "../frame/contract.ts";
import type { Line } from "../lines.ts";

/** Where the sheet puts its body, and the rows it takes besides. */
export const sheetLayout = {
  /**
   * Cells and rows from the sheet's corner to the body's. A body's rows bring their own column
   * for a pointer (`CARD_INSET`), as a card's do, so that column is the sheet's inset.
   */
  x: 2,
  y: 2,
  /** Rows it takes besides its body, its notice and its buttons: its edges and a blank one. */
  chrome: 3,
} as const;

/** The rows of `sheetLayout.chrome` a sheet takes: one fewer where it has no bottom edge. */
export const sheetChrome = (foot: Sheet["foot"] = "edge") =>
  sheetLayout.chrome - (foot === "none" ? 1 : 0);

/** The cells a body row has in a sheet `width` cells wide. */
export const sheetRoom = (width: number) => Math.max(0, width - 2 * sheetLayout.x);

export type Sheet = Pick<CaptionFrame, "title" | "caption" | "close"> & {
  /** The sheet's outer width in cells, edges included. */
  width: number;
  /**
   * Lines laid out for `sheetRoom(width)` cells, each starting with the pointer's column. The
   * host's text field (an `input` slot) keeps its row; a block of Markdown has no place here.
   */
  body: Line[];
  /** Button rows above the bottom edge. */
  footer?: Line[];
  /** A row of its own between the body and the buttons. */
  notice?: Line;
  /**
   * What closes the sheet below: its own edge, or nothing where it stands on a rule the host
   * draws, such as the one over pi's prompt. @default "edge"
   */
  foot?: "edge" | "none";
};
