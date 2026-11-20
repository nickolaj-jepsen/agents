import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { type DefaultTextStyle, Markdown, truncateToWidth } from "@earendil-works/pi-tui";

/**
 * Markdown at a width in a default style, at most `max` lines, the last of a cut one ending in
 * `…` as the kit's `clamp` ends it. A line in that style ends with it still open, and pi pads
 * every line to the terminal's edge, so each line is closed here.
 */
export function markdownLines(
  text: string,
  width: number,
  style?: DefaultTextStyle,
  max = Infinity,
): string[] {
  const lines = new Markdown(text, 0, 0, getMarkdownTheme(), style)
    .render(width)
    .map((line) => line.trimEnd());
  if (lines.length > max) {
    lines.length = Math.max(0, max);
    const last = lines.pop();
    if (last !== undefined)
      lines.push(truncateToWidth(last, Math.max(0, width - 1), "") + (style?.color ?? String)("…"));
  }
  return lines.map((line) => `${line}\x1b[0m`);
}
