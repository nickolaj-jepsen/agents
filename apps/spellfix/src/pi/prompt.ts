/**
 * Where the review stands: on the rule over pi's prompt, so the draft it is about stays in sight.
 * pi gives an extension no number for that row, so a widget of ours is mounted above the prompt
 * and the screen's parts after it are counted.
 *
 * This is linear-issue's pattern (`apps/linear-issue/src/pi/chip.ts`), which stands its draft the
 * same way; an app cannot import another app's file, so the few lines live here too.
 */
import type { Component, OverlayOptions, TUI } from "@earendil-works/pi-tui";
import { ABOVE, reviewWidth } from "../lib/review.ts";

/** Mounted above the prompt and drawing nothing: the mark the prompt is found by. */
export class PromptMark implements Component {
  invalidate(): void {}

  render(): readonly string[] {
    return [];
  }
}

/** A component that holds others under each other, as pi's screen and its parts do. */
type Stacked = { children?: Component[] };

/**
 * Rows from the prompt's top rule to the bottom of the terminal: the prompt, and whatever pi
 * draws under it. Undefined when pi's screen is not laid out that way; the caller then keeps to
 * the bottom edge, with the sheet covering the prompt as it did before.
 */
export function rowsFromPrompt(tui: TUI, mark: Component): number | undefined {
  const stack = (tui as Stacked).children;
  if (!Array.isArray(stack)) return undefined;
  const at = stack.findIndex((entry) => (entry as Stacked).children?.includes(mark));
  if (at < 0 || at === stack.length - 1) return undefined;
  let rows = 0;
  for (const entry of stack.slice(at + 1)) rows += entry.render(tui.terminal.columns).length;
  return rows;
}

/**
 * Where the sheet stands: centred, its sides running down to the prompt's rule `below()` rows
 * over the bottom edge. The numbers are read at every render, since a resize or a taller draft
 * moves the rule while the sheet is open.
 */
export function sheetOptions(tui: TUI, below: () => number): OverlayOptions {
  return {
    anchor: "bottom-center",
    get width() {
      return reviewWidth(tui.terminal.columns);
    },
    get maxHeight() {
      return Math.max(1, tui.terminal.rows - ABOVE - below());
    },
    get margin() {
      return { bottom: below() };
    },
  };
}
