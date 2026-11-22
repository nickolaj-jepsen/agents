/**
 * The draft as a sheet over the transcript: the shared screen in the kit's sheet, painted for
 * pi. It stands on the rule over the prompt, so the prompt stays in sight in front of it.
 */
import { getSelectListTheme, type Theme } from "@earendil-works/pi-coding-agent";
import {
  Editor,
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
import { closeOf } from "@agents/kit-frame/contract.ts";
import {
  cellAt,
  fitPainted,
  paintLines,
  paintText,
  paintedWidth,
  type Painted,
} from "@agents/kit-core/paint/pi.ts";
import { sheetChrome, sheetRoom } from "@agents/kit-sheet/contract.ts";
import { sheet } from "@agents/kit-sheet/terminal.ts";
import { tokens, widthCap } from "@agents/kit-core/tokens.ts";
import type { Form } from "../lib/draft.ts";
import { draw, TITLE, type Drawn, type Intent, type View } from "../lib/screen.ts";

/** Rows of the terminal the sheet leaves above it, so what it was opened over stays in sight. */
const ABOVE = 1;
const WHEEL_LINES = 3;
/** The key that breaks a line in pi's editor, as its prompt has it. */
const NEWLINE = "shift+enter";
/** Lines pi's editor shows at least, and the share of the terminal's rows it shows at most. */
const EDITOR_MIN = 5;
const EDITOR_SHARE = 0.3;

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
 * Where the sheet stands: centred, its foot `below()` rows over the bottom edge, as wide as a
 * Claude Code pane is, so both clients draw the draft in the same room. pi asks an extension
 * for an overlay's options once and reads them at every render, so each is read as it is asked
 * for: the terminal's size and the prompt's height change under an open sheet.
 */
export const sheetOptions = (tui: TUI, below: () => number): OverlayOptions => ({
  anchor: "bottom-center",
  get width() {
    return sheetWidth(tui.terminal.columns);
  },
  get maxHeight() {
    return Math.max(1, tui.terminal.rows - ABOVE - below());
  },
  get margin() {
    return { bottom: below() };
  },
});

/** The terminal height at which pi's editor shows exactly `lines` lines of what it holds. */
const rowsShowing = (lines: number) => {
  let rows = Math.ceil(lines / EDITOR_SHARE);
  while (Math.floor(rows * EDITOR_SHARE) < lines) rows++;
  return rows;
};

export type SheetState = { form: Form | null; view: View };

export class DraftSheet implements Component, Focusable {
  private readonly input = new Input({ prompt: "", placeholder: "Title" });
  private readonly editor: Editor;
  /** Lines the editor is to show: it sizes itself by the terminal's height, so it is told one. */
  private editorLines = EDITOR_MIN;
  private drawn: Drawn | undefined;
  private painted: Painted | undefined;
  /** Where the description's field was painted, for a click in it. */
  private field: { row: number; x: number; width: number; rows: number } | undefined;
  private hover: string | undefined;
  private isFocused = false;
  private typing: View["step"] | undefined;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly state: () => SheetState,
    /** A key or a click, with the screen as it was drawn when it came. */
    private readonly send: (intent: Intent, drawn: Drawn | undefined) => void,
    /** Rows the prompt and what is under it take: the sheet stands on them. Zero for none. */
    private readonly below: () => number,
  ) {
    const rows = () => rowsShowing(this.editorLines);
    this.editor = new Editor(
      // The editor asks its surface for two things: a redraw, and the terminal's height.
      {
        requestRender: () => tui.requestRender(),
        terminal: {
          get rows() {
            return rows();
          },
        },
      } as unknown as TUI,
      {
        borderColor: (text) => paintText(theme, text, { role: "border" }),
        selectList: getSelectListTheme(),
      },
    );
    this.editor.onSubmit = (text) => this.act({ text });
  }

  get focused() {
    return this.isFocused;
  }
  set focused(value: boolean) {
    this.isFocused = value;
    this.focusFields();
  }

  private focusFields() {
    const { step } = this.state().view;
    this.input.focused = this.isFocused && step === "title";
    this.editor.focused = this.isFocused && step === "body";
  }

  invalidate() {}

  render(width: number): string[] {
    const { form, view } = this.state();
    const step = view.step === "title" || view.step === "body" ? view.step : undefined;
    if (step === "title" && this.typing !== step) {
      this.input.setValue(form?.title ?? "");
      // The field has no way to place its cursor: ctrl+e takes it to the end of the title.
      this.input.handleInput("\x05");
    }
    if (step === "body" && this.typing !== step) this.editor.setText(form?.description ?? "");
    this.typing = step;
    this.focusFields();

    const below = this.below();
    const foot = below > 0 ? "none" : "edge";
    const rows = Math.max(8, this.tui.terminal.rows - ABOVE - below) - sheetChrome(foot);
    const drawn = draw(form, view, {
      width: sheetRoom(width),
      rows,
      isActive: true,
      hasAllKeys: true,
      // pi's field is one row and follows the cursor sideways.
      fieldRows: 1,
      newline: NEWLINE,
      hover: this.hover,
    });
    this.drawn = drawn;
    const lines = sheet({
      width,
      title: TITLE,
      close: { ...drawn.close, hover: closeOf(this.hover) },
      body: drawn.body,
      notice: drawn.notice,
      footer: drawn.footer,
      foot,
    });
    const painted = paintLines(this.theme, lines, width, { fill: true });
    this.field = undefined;
    // pi's own fields stand in the rows the drawing keeps for them.
    for (const field of painted.fields) {
      const set = (row: number, text: string) => {
        painted.lines[field.row + row] =
          (row ? field.hang : field.lead) + fitPainted(text, field.width) + field.tail;
      };
      if (step !== "body") {
        set(0, this.input.render(field.width)[0] ?? "");
        continue;
      }
      this.field = {
        row: field.row,
        x: paintedWidth(field.lead),
        width: field.width,
        rows: field.rows,
      };
      this.writing(field.rows, field.width).forEach((text, row) => set(row, text));
    }
    this.painted = painted;
    return painted.lines;
  }

  /**
   * The editor in exactly `rows` rows: its own rules first and last, which count the lines
   * scrolled past, and blank rows over the last while what it holds is shorter.
   */
  private writing(rows: number, width: number): string[] {
    this.editorLines = Math.max(EDITOR_MIN, rows - 2);
    const all = this.editor.render(width);
    const text = all.slice(1, -1).slice(0, Math.max(0, rows - 2));
    const blank = Array.from({ length: Math.max(0, rows - 2 - text.length) }, () => "");
    return [all[0] ?? "", ...text, ...blank, all.at(-1) ?? ""].slice(0, rows);
  }

  private act(intent: Intent) {
    this.send(intent, this.drawn);
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    const { view } = this.state();
    if (matchesKey(data, "ctrl+c")) return this.act({ escape: true });
    if ((view.step === "title" || view.step === "body") && !view.isConfirming) {
      if (matchesKey(data, Key.escape)) return this.act({ escape: true });
      if (view.step === "body") {
        // Enter saves through the editor's own submit, so its key for a new line stays its own.
        this.editor.handleInput(data);
      } else {
        if (matchesKey(data, Key.enter)) return this.act({ text: this.input.getValue() });
        this.input.handleInput(data);
      }
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
    const field = this.field;
    if (
      field &&
      event.y >= field.row &&
      event.y < field.row + field.rows &&
      event.x >= field.x &&
      event.x < field.x + field.width
    ) {
      // A click in the description puts the cursor there, as in pi's own prompt.
      const result = this.editor.handleMouse({
        ...event,
        x: event.x - field.x,
        y: event.y - field.row,
        width: field.width,
        height: field.rows,
      });
      if (result) this.tui.requestRender();
      return result ? { handled: true } : undefined;
    }
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

export const DONE_MARK = tokens.glyph.done;
