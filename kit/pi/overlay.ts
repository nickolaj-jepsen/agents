import type { OverlayOptions } from "@earendil-works/pi-tui";
import { tokens, type WidthClass } from "./tokens.ts";

/**
 * The `ctx.ui.custom` overlay options for a width class: centred, as wide as the terminal
 * allows up to the class's cap.
 * @param cls The width class (see style.md).
 * @param content The widest line in cells; only `auto` reads it.
 */
export function overlayOptions(cls: WidthClass, content = 0): OverlayOptions {
  const edge = tokens.margin;
  if (cls === "wide") {
    const side = tokens.width.wideMargin / 2;
    return {
      anchor: "center",
      width: "100%",
      margin: { top: edge, bottom: edge, left: side, right: side },
    };
  }
  const cap = cls === "auto" ? Math.min(content, tokens.width.dialog) : tokens.width[cls];
  return { anchor: "center", width: Math.max(1, cap), margin: edge };
}

/**
 * Rows a modal may use: the terminal less its top and bottom margin.
 * @param terminalRows The terminal's height.
 */
export const modalRows = (terminalRows: number) => Math.max(1, terminalRows - 2 * tokens.margin);
