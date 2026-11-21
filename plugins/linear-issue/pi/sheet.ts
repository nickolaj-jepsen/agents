/** The draft as a sheet over the transcript: the shared screen in the kit's sheet, painted for pi. */
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Input,
  Key,
  matchesKey,
  type Component,
  type Focusable,
  type OverlayOptions,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { closeHit } from "../../../kit/frame/contract.ts";
import { cellAt, fitPainted, paintLines, type Painted } from "../../../kit/paint/pi.ts";
import { sheetLayout, sheetRoom } from "../../../kit/sheet/contract.ts";
import { sheet } from "../../../kit/sheet/terminal.ts";
import { tokens, widthCap } from "../../../kit/tokens.ts";
import type { Form } from "../core/draft.ts";
import { draw, TITLE, type Drawn, type Intent, type View } from "../core/screen.ts";

/** Rows of the terminal the sheet leaves above it, so what it was opened over stays in sight. */
const ABOVE = 2;
const WHEEL_LINES = 3;

/**
 * The sheet's width on a terminal `columns` wide: what Claude Code gives a pane beside the
 * transcript there, a little under half, between the dialog and the reading width classes.
 */
export const sheetWidth = (columns: number) =>
  Math.max(
    1,
    Math.min(
      columns - 2,
      Math.max(
        widthCap("dialog", columns),
        Math.min(tokens.width.reading, Math.floor(columns * 0.42)),
      ),
    ),
  );

/**
 * Where the sheet stands: on the bottom edge, centred, as wide as a Claude Code pane is, so
 * both clients draw the draft in the same room.
 */
export const sheetOptions = (tui: TUI) => (): OverlayOptions => ({
  anchor: "bottom-center",
  width: sheetWidth(tui.terminal.columns),
  maxHeight: Math.max(1, tui.terminal.rows - ABOVE),
});

export type SheetState = { form: Form | null; view: View };

export class DraftSheet implements Component, Focusable {
  private readonly input = new Input({ prompt: "", placeholder: "Title" });
  private drawn: Drawn | undefined;
  private painted: Painted | undefined;
  private hover: string | undefined;
  private isFocused = false;
  private wasTyping = false;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly state: () => SheetState,
    /** A key or a click, with the screen as it was drawn when it came. */
    private readonly send: (intent: Intent, drawn: Drawn | undefined) => void,
  ) {}

  get focused() {
    return this.isFocused;
  }
  set focused(value: boolean) {
    this.isFocused = value;
    this.input.focused = value && this.state().view.step === "title";
  }

  invalidate() {}

  render(width: number): string[] {
    const { form, view } = this.state();
    const isTyping = view.step === "title";
    if (isTyping && !this.wasTyping) {
      this.input.setValue(form?.title ?? "");
      // The field has no way to place its cursor: ctrl+e takes it to the end of the title.
      this.input.handleInput("\x05");
    }
    this.wasTyping = isTyping;
    this.input.focused = this.isFocused && isTyping;

    const rows = Math.max(8, this.tui.terminal.rows - ABOVE) - sheetLayout.chrome;
    const drawn = draw(form, view, {
      width: sheetRoom(width),
      rows,
      isActive: true,
      hasAllKeys: true,
      // pi's field is one row and follows the cursor sideways.
      fieldRows: 1,
      hover: this.hover,
    });
    this.drawn = drawn;
    const lines = sheet({
      width,
      title: TITLE,
      close: { hover: this.hover === closeHit("close") ? "close" : undefined },
      body: drawn.body,
      notice: drawn.notice,
      footer: drawn.footer,
    });
    const painted = paintLines(this.theme, lines, width, { fill: true });
    // pi's own field stands in the row the drawing keeps for it.
    for (const field of painted.fields)
      painted.lines[field.row] =
        field.lead + fitPainted(this.input.render(field.width)[0] ?? "", field.width) + field.tail;
    this.painted = painted;
    return painted.lines;
  }

  private act(intent: Intent) {
    this.send(intent, this.drawn);
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    const { view } = this.state();
    if (matchesKey(data, "ctrl+c")) return this.act({ escape: true });
    if (view.step === "title" && !view.isConfirming) {
      if (matchesKey(data, Key.enter)) return this.act({ title: this.input.getValue() });
      if (matchesKey(data, Key.escape)) return this.act({ escape: true });
      this.input.handleInput(data);
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.enter)) return this.act({ enter: true });
    if (matchesKey(data, Key.escape)) return this.act({ escape: true });
    if (matchesKey(data, Key.space)) return this.act({ space: true });
    if (matchesKey(data, Key.up) || matchesKey(data, Key.shift("tab")))
      return this.act({ move: -1 });
    if (matchesKey(data, Key.down) || matchesKey(data, Key.tab)) return this.act({ move: 1 });
    const page = this.drawn?.window.page ?? 5;
    if (matchesKey(data, Key.pageUp)) return this.act({ scroll: -page });
    if (matchesKey(data, Key.pageDown)) return this.act({ scroll: page });
    if (/^[a-zA-Z0-9]$/.test(data)) return this.act({ key: data.toLowerCase() });
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type === "wheel") {
      this.act({ scroll: Math.sign(event.wheelDelta ?? 0) * WHEEL_LINES });
      return { handled: true };
    }
    const hit = cellAt(this.painted?.cells[event.y], event.x)?.hit;
    if (event.type === "move") {
      if (hit === this.hover) return undefined;
      this.hover = hit;
      this.tui.requestRender();
      return { handled: true, render: true };
    }
    if (event.type !== "click" || event.button !== "left") return undefined;
    if (hit === undefined) return { handled: true };
    this.act({ hit });
    return { handled: true };
  }
}

/** The glyph a draft put aside is marked with above the prompt. */
export const DRAFT_MARK = "✎";
export const DONE_MARK = tokens.glyph.done;
