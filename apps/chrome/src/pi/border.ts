/**
 * The top border of the editor: the session's label, pi's scroll hint, the state word, pi's working
 * spinner in front of them, and the measurements on the right. A retry, a compaction or a branch
 * summary takes the label's slot, as pi draws them, with the countdown and the key that cancels it.
 *
 * It is handed the width, the editor's own border painter (pi keys it to the thinking level) and
 * pi's status, and answers with one line and where its controls sit, so nothing here reads the
 * screen.
 */
import { cellWidth, truncate } from "@agents/kit-core/lines.ts";
import { paintSpans, paintedWidth } from "@agents/kit-core/paint/pi.ts";
import type { Part, Region } from "../lib/line.ts";
import { spansOf, splitOverlaps } from "../lib/line.ts";
import type { BorderStatus } from "./editor.ts";
import type { Identity } from "./identity.ts";
import type { ChromeState } from "./state.ts";

// Below this the label stops being the point of the row.
const MIN_LABEL_ROOM = 14;

/** One row of the border, and the cells its controls take. */
export type BorderLine = { line: string; regions: Region[] };

export const createBorder = (state: ChromeState, label: Identity) => {
  /** One part of the row, painted; the part the pointer is on is lit. */
  const paintPart = (part: Part): string => {
    const theme = state.ctx?.ui.theme;
    if (!theme) return part.text;
    const lit = part.action !== undefined && part.id === state.hover;
    return paintSpans(
      theme,
      spansOf(part).map((span) =>
        lit
          ? {
              ...span,
              role: span.role === undefined || span.role === "dim" ? ("text" as const) : span.role,
              bold: true,
            }
          : span,
      ),
    );
  };

  /**
   * One continuous line, inset like the footer's text: the leading and trailing dashes stand in
   * for its padding, and the measurements are separated by the same dashes instead of dots, so the
   * row reads as the top of the input box.
   */
  const drawTop = (
    width: number,
    hidden: number,
    border: (text: string) => string,
    status: BorderStatus | undefined,
    levels: readonly Part[][],
  ): BorderLine => {
    const ctx = state.ctx;
    if (!ctx || width <= 0) return { line: border("─".repeat(Math.max(0, width))), regions: [] };
    const theme = ctx.ui.theme;
    const name = label.current()?.text ?? "";
    const stateText = label.stateWord(ctx) || undefined;
    // pi reports scrolled editor content as `↑ N more`; it describes the editor, so it belongs
    // next to the label rather than in the session detail.
    const hint = hidden > 0 ? ` ↑${hidden}` : "";
    const hintPainted = hint ? paintSpans(theme, [{ text: hint, role: "dim" }]) : "";
    const statePart: Part[] = stateText
      ? [{ id: "state", text: stateText, role: stateText === "failed" ? "error" : "warning" }]
      : [];
    // The measurements give way before the state, which is the part that asks you to look.
    const rows: Part[][] = [...levels.map((level) => [...statePart, ...level]), statePart];
    if (statePart.length > 0) rows.push([]);
    // A retry, compaction or branch summary takes the label's slot: it carries the countdown and
    // the key that cancels it.
    const message = status && status.kind !== "working" ? status : undefined;
    // pi's own shape, `── ⠋ Working`, with the label where its message would be.
    const lead =
      status?.kind === "working"
        ? `${border("──")} ${status.renderSpinnerInBorder(width)} `
        : border("── ");
    const leadWidth =
      status?.kind === "working" ? 4 + paintedWidth(status.renderSpinnerInBorder(width)) : 3;
    const separator = border(" ── ");
    // `── ` either side of a part, and the tail that ends the row.
    const SEPARATOR_WIDTH = 4;
    const TAIL_WIDTH = 3;
    const tail = border(" ──");

    for (const row of rows) {
      const parts = row.filter((part) => part.text !== "");
      const right =
        parts.length > 0 ? ` ${parts.map((part) => paintPart(part)).join(separator)}${tail}` : "";
      const rightWidth =
        parts.length > 0
          ? 1 +
            parts.reduce(
              (sum, part, i) => sum + (i === 0 ? 0 : SEPARATOR_WIDTH) + cellWidth(part.text),
              0,
            ) +
            TAIL_WIDTH
          : 0;
      // lead + label + hint + space, then at least one dash.
      const room = width - leadWidth - cellWidth(hint) - 2 - rightWidth;
      if (room < MIN_LABEL_ROOM) continue;
      // Where each control sits, counted from the start of `right`.
      const controls: Region[] = [];
      let column = 1;
      parts.forEach((part, index) => {
        if (index > 0) column += SEPARATOR_WIDTH;
        const partWidth = cellWidth(part.text);
        if (part.action) {
          const pad = part.hitPad ?? 0;
          controls.push({
            x0: column - pad,
            x1: column + partWidth + pad,
            id: part.id,
            action: part.action,
          });
        }
        column += partWidth;
      });
      // The label wears the input's own border colour (pi keys it to the thinking level), so it
      // reads as box chrome rather than prompt text.
      const shown = name ? truncate(name, room) : "";
      const left = message
        ? `${lead}${message.renderInBorder(room)}${hintPainted} `
        : `${lead}${border(shown)}${hintPainted}${name ? " " : ""}`;
      const fill = Math.max(0, width - paintedWidth(left) - rightWidth);
      const rightStart = paintedWidth(left) + fill;
      return {
        line: left + (fill > 0 ? border("─".repeat(fill)) : "") + right,
        // A padded target must not swallow its neighbour.
        regions: splitOverlaps(
          controls.map((control) => ({
            ...control,
            x0: rightStart + control.x0,
            x1: rightStart + control.x1,
          })),
        ),
      };
    }
    return { line: border("─".repeat(width)), regions: [] };
  };

  return { drawTop };
};
