/**
 * The one row above the prompt that offers the form: the round's title, how many answers
 * are in, and the key. A click anywhere on it opens the form.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import { line, span, truncateSpans } from "@agents/kit-core/lines.ts";
import { paintLines } from "@agents/kit-core/paint/pi.ts";

export class AnswerOffer implements Component {
  private isHover = false;

  constructor(
    private readonly theme: Theme,
    private readonly title: string,
    private readonly note: string,
    private readonly open: () => void,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    // The accent names what there is to open; the count and the key stay quiet. Nothing here
    // marks a state, so the row is drawn from the kit's line model rather than a status band.
    const spans = [
      span(" "),
      span(this.title, { role: "accent", bold: this.isHover }),
      span(this.note, { role: "dim" }),
    ];
    return paintLines(this.theme, [line(truncateSpans(spans, width))], width).lines;
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type === "move") {
      if (this.isHover) return { handled: true };
      this.isHover = true;
      return { handled: true, render: true };
    }
    if (event.type === "click" && event.button === "left") {
      this.open();
      return { handled: true };
    }
    return { handled: true };
  }
}
