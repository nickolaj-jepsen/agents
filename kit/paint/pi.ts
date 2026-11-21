/** Paints styled lines for pi: theme colours, and where each control is on its row. */
import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import {
  type DefaultTextStyle,
  Markdown,
  type MarkdownTheme,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { ELLIPSIS, type Line, type Role, type Slot, type Span } from "../lines.ts";

type ThemeColor = Parameters<Theme["fg"]>[0];

const ROLE: Record<Role, ThemeColor> = {
  text: "text",
  dim: "dim",
  accent: "accent",
  success: "success",
  warning: "warning",
  error: "error",
  code: "mdCode",
  border: "borderMuted",
  active: "borderAccent",
  answered: "border",
};

/** One span in the theme: a span with no role keeps the terminal's own colour. */
export function paintSpan(theme: Theme, s: Span): string {
  let out = s.role ? theme.fg(ROLE[s.role], s.text) : s.text;
  if (s.bold) out = theme.bold(out);
  if (s.italic) out = theme.italic(out);
  if (s.underline) out = theme.underline(out);
  return out;
}

export const paintSpans = (theme: Theme, spans: readonly Span[]) =>
  spans.map((s) => paintSpan(theme, s)).join("");

/** Where a control is on a painted row, in cells from its start. */
export type Cell = { start: number; end: number; hit: string };

export type Painted = {
  lines: string[];
  /** The control each row belongs to whole, by row. */
  hits: (string | undefined)[];
  /** The controls on each row and the cells they take, by row. */
  cells: Cell[][];
};

function markdownTheme(theme: Theme): MarkdownTheme {
  const color = (role: ThemeColor) => (text: string) => theme.fg(role, text);
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
      // The highlighter uses pi's global theme; a catalogue story may load a separate module.
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
 * Block Markdown by pi's own renderer, at most `max` lines, the last of a cut one ending in
 * `…`. A line in a default style ends with it still open and pi pads every line to the
 * terminal's edge, so each is closed here.
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
    .map((row) => row.trimEnd());
  if (lines.length > max) {
    lines.length = Math.max(0, max);
    const last = lines.pop();
    if (last !== undefined)
      lines.push(
        truncateToWidth(last, Math.max(0, width - 1), "") + (style?.color ?? String)(ELLIPSIS),
      );
  }
  return lines.map((row) => `${row}\x1b[0m`);
}

const slotRows = (theme: Theme, slot: Slot) =>
  markdownLines(
    theme,
    slot.text,
    slot.width,
    slot.isDim ? { color: (text) => theme.fg("dim", text) } : undefined,
    slot.max,
  ).map((row) => " ".repeat(slot.indent) + row);

export type PaintOptions = {
  /** Pad every row with spaces to `width`: for a frame laid over something else. */
  fill?: boolean;
};

/**
 * @param width pi's own measure has the last word: a line it counts wider is cut, since pi
 * refuses a render with one that does not fit.
 */
export function paintLines(
  theme: Theme,
  lines: readonly Line[],
  width: number,
  { fill = false }: PaintOptions = {},
): Painted {
  const out: Painted = { lines: [], hits: [], cells: [] };
  const push = (text: string, hit: string | undefined, cells: Cell[]) => {
    const fit = visibleWidth(text) > width ? truncateToWidth(text, width, "") : text;
    out.lines.push(fill ? fit + " ".repeat(Math.max(0, width - visibleWidth(fit))) : fit);
    out.hits.push(hit);
    out.cells.push(cells);
  };
  for (const l of lines) {
    if (l.slot) {
      for (const row of slotRows(theme, l.slot)) push(row, l.hit, []);
      continue;
    }
    const cells: Cell[] = [];
    let at = 0;
    let text = "";
    for (const s of l.spans) {
      const end = at + visibleWidth(s.text);
      const last = cells[cells.length - 1];
      if (s.hit !== undefined) {
        if (last && last.hit === s.hit && last.end === at) last.end = end;
        else cells.push({ start: at, end, hit: s.hit });
      }
      text += paintSpan(theme, s);
      at = end;
    }
    // A row that is one control is pressed on its own text, not on the room after it.
    if (l.hit !== undefined && !cells.length) {
      const drawn = visibleWidth(
        l.spans
          .map((s) => s.text)
          .join("")
          .trimEnd(),
      );
      if (drawn > 0) cells.push({ start: 0, end: drawn, hit: l.hit });
    }
    push(text, l.hit, cells);
  }
  return out;
}

/** One line painted, for where a caller places rows itself. */
export function paintLine(theme: Theme, l: Line, width: number) {
  const painted = paintLines(theme, [l], width);
  return { text: painted.lines[0] ?? "", cells: painted.cells[0] ?? [] };
}

/** The control at cell `x` of a painted row. */
export const cellAt = (cells: readonly Cell[] | undefined, x: number) =>
  cells?.find((cell) => x >= cell.start && x < cell.end);
