/** The status band as styled lines: the one drawing both terminals paint. */
import { cellWidth, line, span, truncateSpans, type Line } from "@agents/kit-core/lines.ts";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { StatusBand, StatusBandStatus } from "./contract.ts";

/** The mark of each status in a terminal. */
export const statusGlyph = (status: StatusBandStatus) =>
  status === "success"
    ? tokens.glyph.done
    : status === "error"
      ? tokens.glyph.times
      : tokens.glyph.status.warning;

/**
 * The band's line: the status mark and the text in the status's role, the hint dim after it,
 * and the whole line one control. The text is cut with `…` so the hint stays whole.
 * @param width The room in cells.
 */
export function statusBand(
  { text, hint, hit, status = "warning", hovered }: StatusBand,
  width: number,
): Line[] {
  const tail = ` ${hint}`;
  const room = Math.max(1, width - cellWidth(tail));
  const head = truncateSpans(
    [span(`${statusGlyph(status)} ${text}`, { role: status, bold: hovered })],
    room,
  );
  return [line([...head, span(tail, { role: "dim", bold: hovered })], hit)];
}
