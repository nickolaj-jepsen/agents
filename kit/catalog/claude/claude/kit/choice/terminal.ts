/** The choice list as styled lines: the one drawing both terminals paint. */
import { cellWidth, line, span, wrap, type Line, type Role } from "../lines.ts";
import { tokens } from "../tokens.ts";
import { choiceHit, type ChoiceProps } from "./contract.ts";

/**
 * One row per item: a focus gutter, the key, the mark and the label, wrapped to hang under its
 * first line. Focus is a neutral pointer and a bold label, hover a bold label alone; accent and
 * a filled mark are the chosen answer's.
 * @param width The room in cells.
 */
export function choiceLines(props: ChoiceProps, width: number): Line[] {
  const marks = props.multiple ? tokens.glyph.multi : tokens.glyph.single;
  return props.items.flatMap((item, i) => {
    const chosen = props.chosen.includes(i);
    const focused = props.focus === i;
    const lead = `${tokens.glyph.pointer} ${item.key} ${marks.off} `;
    const pad = span(" ".repeat(cellWidth(lead)));
    const inner = Math.max(1, width - cellWidth(lead));
    // The keyboard's row and the pointer's read alike: bold, in the text colour, never the accent.
    const lit = focused || props.hover === i;
    const role: Role = chosen ? "accent" : item.writeIn && !lit ? "dim" : "text";
    const label = { role, bold: chosen || lit };
    const hit = choiceHit(i);
    return [
      ...wrap(item.text, inner).map((text, row) =>
        line(
          row
            ? [pad, span(text, label)]
            : [
                span(focused ? `${tokens.glyph.pointer} ` : "  ", { bold: true }),
                span(`${item.key} `, { role: "dim" }),
                chosen
                  ? span(`${marks.on} `, { role: "accent", bold: true })
                  : span(`${marks.off} `, { role: "dim" }),
                span(text, label),
              ],
          hit,
        ),
      ),
      ...(item.detail
        ? wrap(item.detail, inner).map((text) => line([pad, span(text, { role: "dim" })], hit))
        : []),
    ];
  });
}
