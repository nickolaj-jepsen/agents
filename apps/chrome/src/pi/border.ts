/**
 * The top border of the editor: the session's label, pi's scroll hint, the state word, and pi's
 * working spinner in front of them. A retry, a compaction or a branch summary takes the label's
 * slot, as pi draws them, with the countdown and the key that cancels it.
 *
 * It is handed the width, the editor's own border painter (pi keys it to the thinking level) and
 * pi's status, and answers with one line, so nothing here reads the screen.
 */
import { cellWidth, truncate } from "@agents/kit-core/lines.ts";
import { paintedWidth, paintSpans } from "@agents/kit-core/paint/pi.ts";
import type { BorderStatus } from "./editor.ts";
import type { Identity } from "./identity.ts";
import type { ChromeState } from "./state.ts";

// Below this the label stops being the point of the row.
const MIN_LABEL_ROOM = 14;

export const createBorder = (state: ChromeState, label: Identity) => {
  /**
   * One continuous line, inset like the footer's text: the leading and trailing dashes stand in
   * for its padding, so the row reads as the top of the input box.
   */
  const drawTop = (
    width: number,
    hidden: number,
    border: (text: string) => string,
    status: BorderStatus | undefined,
  ): string => {
    const ctx = state.ctx;
    if (!ctx || width <= 0) return border("─".repeat(Math.max(0, width)));
    const theme = ctx.ui.theme;
    const name = label.current()?.text ?? "";
    const stateText = label.stateWord(ctx) || undefined;
    const hint = hidden > 0 ? ` ↑${hidden}` : "";

    // pi's own shape, `── ⠋ Working`, with the label where its message would be.
    const lead =
      status?.kind === "working"
        ? `${border("──")} ${status.renderSpinnerInBorder(width)} `
        : border("── ");
    const leadWidth =
      status?.kind === "working" ? 4 + paintedWidth(status.renderSpinnerInBorder(width)) : 3;

    // The state is the part that asks you to look, so it sits at the far end where the
    // measurements will join it, in the colour pi gives an error or a warning.
    const right = stateText
      ? ` ${paintSpans(theme, [{ text: stateText, role: stateText === "failed" ? "error" : "warning" }])} ──`
      : "";
    const rightWidth = stateText ? cellWidth(stateText) + 4 : 0;

    // lead + label + hint + space, then at least one dash.
    const room = width - leadWidth - cellWidth(hint) - 2 - rightWidth;
    if (room < MIN_LABEL_ROOM) return border("─".repeat(width));

    // A retry, compaction or branch summary takes the label's slot: it carries the countdown and
    // the key that cancels it.
    const message = status && status.kind !== "working" ? status : undefined;
    const hintText = hint ? paintSpans(theme, [{ text: hint, role: "dim" }]) : "";
    const left = message
      ? `${border("── ")}${message.renderInBorder(room)}${hintText} `
      : `${lead}${border(name ? truncate(name, room) : "")}${hintText}${name ? " " : ""}`;
    const fill = Math.max(0, width - paintedWidth(left) - rightWidth);
    return left + (fill > 0 ? border("─".repeat(fill)) : "") + right;
  };

  return { drawTop };
};
