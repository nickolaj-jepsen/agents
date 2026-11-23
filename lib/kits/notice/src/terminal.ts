/** The notice and the empty state as styled lines: the one drawing both terminals paint. */
import { clamp, line, truncateSpans, wrapSpans, type Line } from "@agents/kit-core/lines.ts";
import type { EmptyStateProps, NoticeTerminal } from "./contract.ts";

/**
 * One line telling the person what just happened, in the role of its status, cut to the room
 * with `…`. A terminal has no icon: the words take the status's colour, and a span with no role
 * takes it too.
 */
export function notice({
  text,
  width,
  status = "warning",
  isWrapped = false,
}: NoticeTerminal): Line[] {
  // A pending state is only quiet words in a terminal.
  const role = status === "pending" ? "dim" : status;
  if (typeof text !== "string") {
    const styled = text.map((s) => ({ ...s, role: s.role ?? role }));
    return isWrapped
      ? wrapSpans(styled, width).map((row) => line(row))
      : [line(truncateSpans(styled, width))];
  }
  const rows = isWrapped ? clamp(text, width) : clamp(text, width, { min: 1, max: 1 });
  return rows.map((row) => line([{ text: row, role }]));
}

/**
 * What a list says when there is nothing in it: dim words standing in for its rows, wrapped.
 * Say what is missing and, if it helps, what makes rows appear.
 */
export function emptyState({ text, width }: EmptyStateProps<"pi" | "claude-terminal">): Line[] {
  return clamp(text, width).map((row) => line([{ text: row, role: "dim" }]));
}
