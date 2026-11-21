/**
 * The widget above the prompt: a draft put aside as one line, its Open and Discard pressed with
 * the mouse. It is mounted for the whole session and draws no row while there is nothing to
 * show, which also makes it the mark the sheet finds the prompt by.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI, TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import { cellAt, paintLines, type Cell } from "../../../kit/paint/pi.ts";
import { draftChip } from "../core/chip.ts";
import type { Form } from "../core/draft.ts";

/** How /linear is typed: the line's way back for the keyboard. */
const OPEN_KEY = "/linear";

export type ChipState = { form: Form; isArmed: boolean };

export class DraftChip implements Component {
  private cells: Cell[] = [];
  private hover: string | undefined;

  constructor(
    private readonly theme: Theme,
    /** The draft to show, or nothing while it is on screen or there is none. */
    private readonly read: () => ChipState | undefined,
    private readonly press: (hit: string) => void,
  ) {}

  invalidate() {}

  render(width: number): string[] {
    const state = this.read();
    if (!state) {
      this.cells = [];
      this.hover = undefined;
      return [];
    }
    const drawn = draftChip(state.form, width, {
      openKey: OPEN_KEY,
      // Discard is the mouse's here: a key typed at the prompt is the prompt's.
      discardKey: "",
      isArmed: state.isArmed,
      hover: this.hover,
    });
    const painted = paintLines(this.theme, [drawn], width);
    this.cells = painted.cells[0] ?? [];
    return painted.lines;
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const hit = event.y === 0 ? cellAt(this.cells, event.x)?.hit : undefined;
    if (event.type === "move") {
      if (hit === this.hover) return undefined;
      this.hover = hit;
      // pi drops a result that is not `handled`, and its `render` with it.
      return { handled: true, render: true };
    }
    if (hit === undefined || event.button !== "left") return undefined;
    if (event.type === "click") this.press(hit);
    return event.type === "press" || event.type === "click" ? { handled: true } : undefined;
  }
}

/** A component that holds others under each other, as pi's screen and its parts do. */
type Stacked = { children?: Component[] };

/**
 * Rows from the prompt's top rule to the bottom of the terminal: the prompt, and whatever pi
 * draws under it. pi stacks its screen as one list, with the widgets above the prompt as the
 * entry before it, so everything after the entry holding `mark` is counted. Nothing when pi's
 * screen is not laid out that way (pi 1.5.2 is): the caller then keeps to the bottom edge.
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
