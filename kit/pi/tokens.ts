/**
 * Every number, glyph and colour role of the house style
 * (skills/agent-plugin-dev/references/style.md). One edit here restyles every plugin.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";

type ThemeColor = Parameters<Theme["fg"]>[0];

export const tokens = {
  /** Width classes: caps in columns, never targets. `wide` is the terminal less `wideMargin`. */
  width: { reading: 96, split: 124, dialog: 72, wideMargin: 2 },
  /** Prose is wrapped at this measure even in a wider pane. */
  prose: 80,
  /** From this many terminal columns a list with detail is two panes; below it stacks. */
  splitFrom: 110,
  /** The list pane's share of a split's content width. */
  splitRatio: 0.55,
  /** Cells of padding inside a border. */
  padding: 1,
  /** Cells between metadata columns, and before the first. */
  gutter: 2,
  /** From this pane width dated entries use a date column; narrower, a date line. */
  entriesFrom: 50,
  /** Cells of the date column of dated entries: an ISO date. */
  dateWidth: 10,
  /** A row's title is never given less than this; metadata columns drop first. */
  minTitle: 16,
  /** Blank rows kept clear of the terminal's edge by a modal. */
  margin: 1,
  glyph: {
    pointer: "❯",
    multi: { off: "□", on: "■" },
    single: { off: "○", on: "●" },
    ellipsis: "…",
    more: { up: "↑", down: "↓" },
    rule: "─",
    done: "✓",
    times: "×",
    noteMid: "│",
    noteEnd: "╰▸",
    kind: { missing: "+", stale: "↻", wrong: "!" },
  },
  border: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│", down: "┬", up: "┴" },
  /** The four roles of the style, plus the frame's own line. Values are pi theme colours. */
  role: {
    text: "text",
    dim: "dim",
    accent: "accent",
    success: "success",
    warning: "warning",
    error: "error",
    border: "borderMuted",
  } satisfies Record<string, ThemeColor>,
} as const;

export type Role = keyof typeof tokens.role;

/**
 * Colours `text` in a role of the theme. Call at render time so a theme change shows.
 * @param role One of the style's colour roles, never a raw theme colour.
 */
export const paint = (theme: Theme, role: Role, text: string) => theme.fg(tokens.role[role], text);

/** A width class: the cap for `reading`, `split`, `dialog`; `wide` and `auto` have none. */
export type WidthClass = "reading" | "split" | "dialog" | "wide" | "auto";

/**
 * The class's cap in columns on a terminal `columns` wide, or the content width for `auto`.
 * @param cls The width class (see style.md).
 * @param columns The terminal's width.
 * @param content The widest line in cells; only `auto` reads it.
 */
export function widthCap(cls: WidthClass, columns: number, content = 0): number {
  const cap = (n: number) => Math.max(1, Math.min(n, columns));
  if (cls === "wide") return cap(columns - tokens.width.wideMargin);
  if (cls === "auto") return cap(Math.min(content, tokens.width.dialog));
  return cap(tokens.width[cls]);
}
