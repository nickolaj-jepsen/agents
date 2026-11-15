import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { clamp, type ClampOptions } from "./text.ts";
import { paint, tokens, type Role } from "./tokens.ts";

/**
 * A section header: bold title, then a dim rule to the edge.
 * @param title Cut with `…` when it is wider than `width`.
 */
export function section(theme: Theme, width: number, title: string): string {
  const head = truncateToWidth(title, Math.max(1, width), tokens.glyph.ellipsis);
  const room = width - visibleWidth(head) - 1;
  return (
    theme.bold(paint(theme, "text", head)) +
    (room > 0 ? " " + paint(theme, "dim", tokens.glyph.rule.repeat(room)) : "")
  );
}

/**
 * Wrapped prose, at the measure when the pane is wider than it.
 * @param options Bounds for the wrap, as `clamp` takes them.
 * @param role The colour role of every line.
 */
export function prose(
  theme: Theme,
  width: number,
  text: string,
  options: ClampOptions = {},
  role: Role = "text",
): string[] {
  return clamp(text, Math.min(width, tokens.prose), options).map((l) => paint(theme, role, l));
}

/**
 * A note: a dim gutter, `│` on each line but the last, `╰▸` on the last.
 * @param options Bounds for the wrap, as `clamp` takes them.
 */
export function note(theme: Theme, width: number, text: string, options: ClampOptions = {}) {
  const lines = clamp(text, width - 3, options);
  return lines.map((line, i) => {
    const last = i === lines.length - 1;
    return (
      paint(theme, "dim", last ? tokens.glyph.noteEnd + " " : tokens.glyph.noteMid + "  ") + line
    );
  });
}

/**
 * One line telling the person what just happened, cut to `width`.
 * @param status The colour role; use success, error or warning only for an actual state.
 */
export function notice(
  theme: Theme,
  width: number,
  text: string,
  status: "success" | "warning" | "error" | "dim" = "warning",
): string {
  return clamp(text, width, { min: 1, max: 1 }).map((l) => paint(theme, status, l))[0] ?? "";
}

/**
 * What a list says when there is nothing in it, wrapped and dim.
 * @param text Say what is missing and, if it helps, what makes rows appear. */
export function emptyState(theme: Theme, width: number, text: string): string[] {
  return clamp(text, width).map((l) => paint(theme, "dim", l));
}
