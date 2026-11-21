/** Paints styled lines for pi: theme colours, and which control each row belongs to. */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Line, Role, Span } from "../lines.ts";

type ThemeColor = Parameters<Theme["fg"]>[0];

const ROLE: Record<Role, ThemeColor> = {
  text: "text",
  dim: "dim",
  accent: "accent",
  success: "success",
  warning: "warning",
  error: "error",
};

const ink = (theme: Theme, s: Span) => {
  let out = theme.fg(ROLE[s.role ?? "text"], s.text);
  if (s.bold) out = theme.bold(out);
  if (s.underline) out = theme.underline(out);
  return out;
};

export type Painted = {
  lines: string[];
  /** The control of each row, by row index. */
  hits: (string | undefined)[];
};

/**
 * @param width pi's own measure has the last word: a line it counts wider is cut, since pi
 * refuses a render with one that does not fit.
 */
export function paintLines(theme: Theme, lines: Line[], width: number): Painted {
  return {
    lines: lines.map((l) => {
      const text = l.spans.map((s) => ink(theme, s)).join("");
      return visibleWidth(text) > width ? truncateToWidth(text, width, "") : text;
    }),
    hits: lines.map((l) => l.hit),
  };
}
