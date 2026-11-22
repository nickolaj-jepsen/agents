/** The notice and the empty state as styled lines: the one drawing both terminals paint. */
import {
  clamp,
  line,
  truncateSpans,
  wrapSpans,
  type Line,
  type Span,
} from "@agents/kit-core/lines.ts";
import type { NoticeOptions, NoticeStatus } from "./contract.ts";

/**
 * One line telling the person what just happened, in the role of its status, cut to the room
 * with `…`.
 * @param text Words, or spans where part of the line stands out (a word in its context); a span
 * with no role takes the status's.
 * @param status Success, warning and error only for an actual state. @default "warning"
 */
export function notice(
  text: string | readonly Span[],
  width: number,
  status: NoticeStatus = "warning",
  { isWrapped = false }: NoticeOptions = {},
): Line[] {
  if (typeof text !== "string") {
    const styled = text.map((s) => ({ ...s, role: s.role ?? status }));
    return isWrapped
      ? wrapSpans(styled, width).map((row) => line(row))
      : [line(truncateSpans(styled, width))];
  }
  const rows = isWrapped ? clamp(text, width) : clamp(text, width, { min: 1, max: 1 });
  return rows.map((row) => line([{ text: row, role: status }]));
}

/**
 * What a list says when there is nothing in it: dim words standing in for its rows, wrapped.
 * @param text Say what is missing and, if it helps, what makes rows appear.
 */
export function emptyState(text: string, width: number): Line[] {
  return clamp(text, width).map((row) => line([{ text: row, role: "dim" }]));
}
