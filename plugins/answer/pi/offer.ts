/**
 * The one row above the prompt that offers the form: the round's title, how many answers
 * are in, and the key. A click anywhere on it opens the form.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  truncateToWidth,
} from "@earendil-works/pi-tui";

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
    const t = this.theme;
    const title = t.fg("accent", this.isHover ? t.bold(this.title) : this.title);
    return [truncateToWidth(` ${title}${t.fg("dim", this.note)}`, width, "…")];
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
