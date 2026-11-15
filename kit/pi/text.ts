import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { tokens } from "./tokens.ts";

export type ClampOptions = {
  /**
   * Fewer lines than this are padded with blank ones, so rows keep one height.
   * @default 0
   */
  min?: number;
  /**
   * More lines than this are cut, the last filled to its end before the `…`.
   * @default Infinity
   */
  max?: number;
  /** A length in characters: as many lines as that much text needs at this width. */
  target?: number;
};

/**
 * Wraps `text` to `width` cells and returns lines, within the bounds. Nothing is padded or cut
 * unless asked: `{min: 1, max: 1}` is a one-line truncation, no options wraps without limit.
 * @param width Cells, not characters; wide characters count two.
 */
export function clamp(text: string, width: number, options: ClampOptions = {}): string[] {
  if (width < 1) return [];
  const { min = 0, max = Infinity, target } = options;
  const wanted = target === undefined ? Infinity : Math.max(1, Math.ceil(target / width));
  const cap = Math.max(0, Math.max(min, Math.min(max, wanted)));
  let lines = wrapTextWithAnsi(text, width);
  if (lines.length > cap) {
    if (cap === 0) return [];
    // The cut line takes the rest of the text, so it is full before the ellipsis.
    const rest = lines.slice(cap - 1).join(" ");
    lines = [...lines.slice(0, cap - 1), truncateToWidth(rest, width, tokens.glyph.ellipsis)];
  }
  while (lines.length < min) lines.push("");
  return lines;
}

/**
 * `text` padded with spaces to `width` cells, cut with `…` when longer.
 * @param width Cells.
 */
export const fit = (text: string, width: number) =>
  truncateToWidth(text, Math.max(0, width), tokens.glyph.ellipsis, true);

/**
 * `text` right-aligned in `width` cells.
 * @param width Cells.
 */
export const alignRight = (text: string, width: number) =>
  " ".repeat(Math.max(0, width - visibleWidth(text))) + text;
