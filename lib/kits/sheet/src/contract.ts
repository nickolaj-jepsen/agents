/** The sheet's contract: its model and what each drawing is given. No host imports. */
import { frameFields, frameNeeds, type Frame, type Slots } from "@agents/kit-frame/contract.ts";
import type { Line } from "@agents/kit-core/lines.ts";
import { modelFields } from "@agents/kit-core/manifest.ts";
import type { Props, Surface } from "@agents/kit-core/surfaces.ts";

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

/**
 * The sheet's model: a frame, and where it stands. A sheet's footer is several rows of buttons.
 * @typeParam S How the body, the footer, the notice and the head are given.
 */
export type SheetModel<S extends Slots> = Omit<Frame<S>, "end"> & {
  /**
   * What closes the sheet below: its own edge, or nothing where it stands on a rule the host
   * draws, such as the one over pi's prompt. @default "edge"
   */
  foot?: "edge" | "none";
};

/** The capability each gated field needs: a frame's, and the cells `foot` is set in. */
export const sheetNeeds = { ...frameNeeds, foot: "cells" } as const;

export const sheetFields = modelFields<SheetModel<Slots>>()([
  ...frameFields.filter((k): k is Exclude<(typeof frameFields)[number], "end"> => k !== "end"),
  "foot",
]);

/** What a terminal lays out: the body's lines, each starting with the pointer's column, and button rows. */
export type SheetTerminalSlots = { body: Line[]; footer: Line[]; notice: Line; head: never };

export type SheetProps<S extends Slots, On extends Surface> = Props<
  SheetModel<S>,
  typeof sheetNeeds,
  On
>;

/** What `sheet` is given on a terminal. */
export type Sheet = SheetProps<SheetTerminalSlots, "pi" | "claude-terminal">;
