/** The status band as styled lines: the one drawing both terminals paint. */
import { cellWidth, line, span, truncateSpans, type Line } from "@agents/kit-core/lines.ts";
import { meaningOf } from "@agents/kit-core/icons.ts";
import type { StatusBandTerminal } from "./contract.ts";
import { statusMeaning } from "./internal.ts";

/**
 * The band's line: the status mark and the text in the status's role, the hint dim after it,
 * and the whole line one control. The text is cut with `…` so the hint stays whole.
 */
export function statusBand({
  text,
  hint,
  hit,
  width,
  status = "warning",
  hovered,
}: StatusBandTerminal): Line[] {
  const tail = ` ${hint}`;
  const room = Math.max(1, width - cellWidth(tail));
  const head = truncateSpans(
    [span(`${meaningOf(statusMeaning(status)).glyph} ${text}`, { role: status, bold: hovered })],
    room,
  );
  return [line([...head, span(tail, { role: "dim", bold: hovered })], hit)];
}
