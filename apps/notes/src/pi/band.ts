/**
 * The widget above the prompt: notes a turn wrote since the person last looked, as one line whose
 * way in reads the newest and whose Dismiss takes it down, both pressed with the mouse. A widget
 * never takes the keyboard, so the line names /notes for it. It is mounted for the whole session
 * and draws no row while there is nothing to show.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import { cellAt, paintLines, type Cell } from "@agents/kit-core/paint/pi.ts";
import { bandLine, type Band } from "../lib/screen.ts";

/** How /notes is typed: the line's way in for the keyboard. */
const OPEN_KEY = "/notes";

export class NotesBand implements Component {
  private cells: Cell[] = [];
  private hover: string | undefined;

  constructor(
    private readonly theme: Theme,
    /** What to show, or nothing while there is no news. */
    private readonly read: () => Band | undefined,
    private readonly press: (hit: string) => void,
  ) {}

  invalidate() {}

  render(width: number): string[] {
    const band = this.read();
    if (!band) {
      this.cells = [];
      this.hover = undefined;
      return [];
    }
    const drawn = bandLine({ text: band.text, hint: OPEN_KEY, width, hover: this.hover });
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
