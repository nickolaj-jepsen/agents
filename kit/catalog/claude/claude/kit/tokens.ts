/** The style's numbers and glyphs, shared by every client; one edit here restyles them all. No host imports. */
export const tokens = {
  /** Width classes: caps in columns, never targets. `wide` is the room less `wideMargin`. */
  width: { reading: 96, split: 124, dialog: 72, wideMargin: 2 },
  /** Prose is wrapped at this measure even in a wider room. */
  prose: 80,
  /** Cells between two things on a row: a label and its text, two buttons, two columns. */
  gutter: 2,
  glyph: {
    pointer: "❯",
    single: { off: "○", on: "●" },
    multi: { off: "□", on: "■" },
    /** The mark of an answer the person writes themselves, while it is empty. */
    writeIn: "+",
    ellipsis: "…",
    more: { up: "↑", down: "↓" },
    rule: "─",
    done: "✓",
    times: "×",
    enter: "↵",
    bullet: "•",
    /** The rail down the left of a card in a transcript. */
    rail: "│",
  },
} as const;

/** A width class: the cap for `reading`, `split`, `dialog`; `wide` and `auto` have none of their own. */
export type WidthClass = "reading" | "split" | "dialog" | "wide" | "auto";

/**
 * The class's cap in columns in a room `columns` wide, or the content width for `auto`.
 * @param content The widest line in cells; only `auto` reads it.
 */
export function widthCap(cls: WidthClass, columns: number, content = 0): number {
  const cap = (n: number) => Math.max(1, Math.min(n, columns));
  if (cls === "wide") return cap(columns - tokens.width.wideMargin);
  if (cls === "auto") return cap(Math.min(content, tokens.width.dialog));
  return cap(tokens.width[cls]);
}
