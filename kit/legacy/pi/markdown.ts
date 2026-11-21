import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import {
  type DefaultTextStyle,
  Markdown,
  type MarkdownTheme,
  truncateToWidth,
} from "@earendil-works/pi-tui";

function markdownTheme(theme: Theme): MarkdownTheme {
  const color = (role: Parameters<Theme["fg"]>[0]) => (text: string) => theme.fg(role, text);
  return {
    heading: color("mdHeading"),
    link: color("mdLink"),
    linkUrl: color("mdLinkUrl"),
    code: color("mdCode"),
    codeBlock: color("mdCodeBlock"),
    codeBlockBorder: color("mdCodeBlockBorder"),
    quote: color("mdQuote"),
    quoteBorder: color("mdQuoteBorder"),
    hr: color("mdHr"),
    listBullet: color("mdListBullet"),
    bold: (text) => theme.bold(text),
    italic: (text) => theme.italic(text),
    underline: (text) => theme.underline(text),
    strikethrough: (text) => theme.strikethrough(text),
    highlightCode(code, lang) {
      // The highlighter uses Pi's global theme; catalogue stories may load a separate module.
      try {
        return (
          getMarkdownTheme().highlightCode?.(code, lang) ??
          code.split("\n").map(color("mdCodeBlock"))
        );
      } catch {
        return code.split("\n").map(color("mdCodeBlock"));
      }
    },
  };
}

/**
 * Markdown at a width in a default style, at most `max` lines, the last of a cut one ending in
 * `…` as the kit's `clamp` ends it. A line in that style ends with it still open, and pi pads
 * every line to the terminal's edge, so each line is closed here.
 */
export function markdownLines(
  theme: Theme,
  text: string,
  width: number,
  style?: DefaultTextStyle,
  max = Infinity,
): string[] {
  const lines = new Markdown(text, 0, 0, markdownTheme(theme), style)
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
