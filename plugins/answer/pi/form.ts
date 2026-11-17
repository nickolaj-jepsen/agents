/**
 * The answer form, drawn in the editor's place: one item per screen and a
 * review, every row and key chip clickable. A key pick records the answer and goes on
 * to the next item unanswered; a click takes it and opens its note, and a click on the
 * taken answer goes on. A note is also `n` or a click on `add a note` under the answer,
 * and `m` lets several options be one answer. `y` takes the recommendation. The
 * frame is the kit's `bandShell`; its top border holds the question stops, a click on one
 * goes to that question. The draft and every step through it are the
 * core's (`../core/forms.ts`), which Claude Code's mod shares; this file only
 * draws its view and maps keys and clicks onto those steps.
 */
import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  type Focusable,
  Input,
  Key,
  Markdown,
  matchesKey,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import {
  bandAct,
  bandShell,
  chipRow,
  tokens,
  type Band,
  type BandRow,
  type Chip,
} from "../../../kit/pi/ui.ts";
import type { Action, View } from "../core/forms.ts";

/** `fill` writes the reply into the editor; `send` sends it as the person's message instead. */
export type FormResult = { fill: boolean; send?: boolean };

/** One step of the draft (`apply` in the core). */
export type FormAction = Action;

type Item = NonNullable<View["item"]>;

type Act =
  | { kind: "entry"; index: number }
  | {
      kind:
        | "note"
        | "several"
        | "back"
        | "forward"
        | "skip"
        | "review"
        | "fill"
        | "send"
        | "accept";
    }
  | { kind: "goto"; index: number };

/** A drawn row: a whole-row target, or chips hit by column. */
type Row = BandRow<Act>;

const MIN_WIDTH = 30;

export class AnswerForm implements Component, Focusable {
  /** The highlighted entry on an item's screen. */
  private cursor = 0;
  private editing: "text" | "note" | undefined;
  /** Whether picks toggle on the shown item; unset follows its answer. */
  private several: boolean | undefined;
  private readonly input = new Input({ prompt: "› ", placeholder: "" });
  /** First body row shown when the item is taller than the frame. */
  private offset = 0;
  /** What the last render drew, for the mouse. */
  private band: Pick<Band<Act>, "hits" | "maxOffset" | "lines" | "offset"> = {
    hits: new Map(),
    maxOffset: 0,
    offset: 0,
    lines: [],
  };
  private isFocused = false;
  /** Keys that came while a step ran, so a quick typist's note isn't lost to it. */
  private queued: string[] = [];
  private isStepping = false;
  /** The body rows the form stands at, measured once at its width: its tallest question's. */
  private measured: { width: number; rows: number } | undefined;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private view: View,
    private readonly stepper: (action: FormAction) => Promise<View | null>,
    private readonly done: (result: FormResult) => void,
    /** Every question's screen, for the height the form stands at. */
    private readonly steps: View[] = [],
  ) {
    this.resetCursor();
  }

  get focused(): boolean {
    return this.isFocused;
  }

  set focused(value: boolean) {
    this.isFocused = value;
    this.input.focused = value && this.editing !== undefined;
  }

  invalidate(): void {}

  private get isSeveral(): boolean {
    return this.several ?? this.view.item?.isSeveral ?? false;
  }

  private resetCursor(): void {
    this.cursor = this.view.item?.start ?? 0;
  }

  /** What a step made of the form. Another form, or none, ends this one. */
  refresh(view: View | null): void {
    if (!view || view.id !== this.view.id) {
      this.done({ fill: false });
      return;
    }
    const moved = view.step !== this.view.step;
    this.view = view;
    if (moved) {
      this.offset = 0;
      this.several = undefined;
      this.resetCursor();
      this.stopEditing();
    }
    this.tui.requestRender();
  }

  /** Takes one step; `then` runs once it landed, and then whatever was typed meanwhile. */
  private step(action: FormAction, then?: () => void): void {
    this.isStepping = true;
    void this.stepper(action)
      .then((view) => {
        if (view) {
          this.refresh(view);
          then?.();
        }
      })
      .finally(() => {
        this.isStepping = false;
        for (const data of this.queued.splice(0)) this.handleInput(data);
      });
  }

  private startEditing(field: "text" | "note"): void {
    const item = this.view.item;
    const value = field === "text" ? (item?.written ?? "") : item ? item.note : this.view.note;
    this.editing = field;
    this.input.setValue(value);
    this.input.focused = this.isFocused;
    this.tui.requestRender();
  }

  private stopEditing(): void {
    this.editing = undefined;
    this.input.focused = false;
    this.tui.requestRender();
  }

  /** Enter in a field: a write-in is the answer; a note is kept, and an answered item goes on. */
  private commit(): void {
    const text = this.input.getValue();
    const isNote = this.editing === "note";
    const isAnswered = this.view.item?.entries.some((entry) => entry.isChosen) ?? false;
    this.stopEditing();
    if (!isNote) this.step({ do: "write", text });
    else this.step({ do: "note", text }, isAnswered ? () => this.step({ do: "next" }) : undefined);
  }

  private act(act: Act): void {
    switch (act.kind) {
      case "entry": {
        const entry = this.view.item?.entries[act.index];
        if (!entry) return;
        this.cursor = act.index;
        // A pick is the answer and the form goes on; one of several stays; a write-in opens its field.
        if (entry.kind === "write") return this.startEditing("text");
        if (this.isSeveral) return this.step({ do: "toggle", entry: act.index });
        return this.step({ do: "pick", entry: act.index }, () => this.step({ do: "next" }));
      }
      case "accept":
        if (!this.view.item?.canAccept) return;
        return this.step({ do: "accept" }, () => this.step({ do: "next" }));
      case "note":
        return this.startEditing("note");
      case "several":
        if (!this.view.item?.canSeveral) return;
        this.several = !this.isSeveral;
        this.tui.requestRender();
        return;
      case "back":
      case "forward":
      case "skip":
      case "review":
        return this.step({ do: act.kind });
      case "goto":
        return this.step({ do: "go", step: act.index });
      case "fill":
      case "send":
        if (!this.view.reply) return;
        return this.done({ fill: true, send: act.kind === "send" });
    }
  }

  private scroll(step: number): void {
    this.offset = Math.max(0, Math.min(this.band.maxOffset, this.offset + step));
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    if (this.isStepping) {
      this.queued.push(data);
      return;
    }
    if (this.editing) {
      if (matchesKey(data, Key.escape)) this.stopEditing();
      else if (matchesKey(data, Key.enter)) this.commit();
      else {
        this.input.handleInput(data);
        this.tui.requestRender();
      }
      return;
    }
    if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c")) {
      this.done({ fill: false });
      return;
    }
    if (matchesKey(data, Key.shift("up")) || matchesKey(data, Key.shift("down"))) {
      this.scroll(matchesKey(data, Key.shift("down")) ? 3 : -3);
      return;
    }
    const review = this.view.isReview;
    const count = review ? this.view.count : (this.view.item?.entries.length ?? 0);
    const down = matchesKey(data, Key.down) || data === "j";
    if (down || matchesKey(data, Key.up) || data === "k") {
      this.cursor = (this.cursor + (down ? 1 : -1) + count) % count;
      this.tui.requestRender();
      return;
    }
    const digit = /^[1-9]$/.test(data) ? Number(data) - 1 : -1;
    if (digit >= 0 && digit < count) {
      this.act(review ? { kind: "goto", index: digit } : { kind: "entry", index: digit });
      return;
    }
    if (matchesKey(data, Key.enter)) {
      this.act(review ? { kind: "fill" } : { kind: "entry", index: this.cursor });
      return;
    }
    const keys: Record<string, Act["kind"]> = review
      ? { n: "note", b: "back", h: "back", s: "send" }
      : {
          y: "accept",
          b: "back",
          h: "back",
          f: "forward",
          l: "forward",
          s: "skip",
          r: "review",
          n: "note",
          m: "several",
        };
    const kind =
      keys[data] ??
      (matchesKey(data, Key.left) || matchesKey(data, Key.shift("tab"))
        ? "back"
        : matchesKey(data, Key.right) || matchesKey(data, Key.tab)
          ? "forward"
          : undefined);
    if (kind && kind !== "entry" && kind !== "goto") this.act({ kind });
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    // Zero-based from the top border, so a body row is the frame row itself.
    const inside = event.y >= 0 && event.y < this.band.lines.length;
    if (event.type === "wheel" && event.wheelDelta) {
      if (!inside) return undefined;
      this.scroll(event.wheelDelta < 0 ? -1 : 1);
      return { handled: true };
    }
    const act = bandAct(this.band, event.x, event.y);
    if (!act) return inside ? { handled: true } : undefined;
    if (event.type === "move" && act.kind === "entry" && act.index !== this.cursor) {
      this.cursor = act.index;
      this.tui.requestRender();
      return { handled: true };
    }
    if (event.type === "press") return { handled: true, focus: true };
    if (event.type !== "click" || event.button !== "left") return { handled: true };
    if (this.isStepping) return { handled: true };
    this.click(act);
    return { handled: true };
  }

  /**
   * A click on an answer takes it and opens its note; a click on the one already taken goes
   * on, so a second click is the way on. The keys go on at once (`act`).
   */
  private click(act: Act): void {
    if (act.kind !== "entry") return this.act(act);
    const entry = this.view.item?.entries[act.index];
    if (!entry || entry.kind === "write" || this.isSeveral) return this.act(act);
    this.cursor = act.index;
    if (entry.isChosen) {
      this.stopEditing();
      return this.step({ do: "next" });
    }
    this.step({ do: "pick", entry: act.index }, () => this.startEditing("note"));
  }

  /**
   * The divider's question stops: a mark and the label of each question, the one on show in
   * the accent, each a click on that question. Too wide a row for the border is left out.
   */
  private stops(): Row {
    const t = this.theme;
    let text = "";
    const cells: NonNullable<Row["cells"]> = [];
    this.view.review.forEach((row, i) => {
      if (text) text += "  ";
      const start = visibleWidth(text);
      const mark = row.isAnswered
        ? t.fg("success", tokens.glyph.done)
        : t.fg("dim", tokens.glyph.single.off);
      const isHere = !this.view.isReview && i === this.view.step;
      text += `${mark} ${isHere ? t.fg("accent", row.label) : t.fg("dim", row.label)}`;
      cells.push({ start, end: visibleWidth(text), act: { kind: "goto", index: i } });
    });
    return { text, cells };
  }

  private wrapped(text: string, width: number, style?: (s: string) => string, indent = ""): Row[] {
    return wrapTextWithAnsi(text, Math.max(8, width - indent.length)).map((line) => ({
      text: indent + (style ? style(line) : line),
    }));
  }

  private field(label: string, width: number): Row {
    return {
      text: `${this.theme.fg("dim", label)} ${this.input.render(width - label.length - 1)[0] ?? ""}`,
    };
  }

  /** The body rows of the form's tallest question at `width`, measured once; undefined with none. */
  private tallest(width: number): number | undefined {
    if (this.measured?.width !== width) {
      const rows = this.steps.reduce((n, step) => {
        const measured = step.item ? this.itemRows(step.item, width).length : 0;
        return Math.max(n, measured);
      }, 0);
      this.measured = { width, rows };
    }
    return this.measured.rows || undefined;
  }

  private itemRows(item: Item, width: number): Row[] {
    const t = this.theme;
    const rows: Row[] = [...this.wrapped(item.title, width, (s) => t.bold(s)), { text: "" }];
    if (item.body) {
      const md = new Markdown(item.body, 0, 0, getMarkdownTheme()).render(Math.max(8, width));
      rows.push(...md.map((text) => ({ text })), { text: "" });
    }
    // A note sits under the answer it is about; with none yet, under the entries.
    const chosen = item.entries.findIndex((entry) => entry.isChosen);
    const last = item.entries.length - 2;
    const noteAt = chosen >= 0 && chosen <= last ? chosen : last;
    // An answered question with no note offers one as a row, for a click to open.
    const note: Row[] =
      this.editing === "note"
        ? [this.field("   note", width)]
        : item.note
          ? this.wrapped(`${t.fg("dim", "Note:")} ${item.note}`, width, undefined, "   ")
          : chosen >= 0
            ? [{ text: t.fg("dim", "   ╰▸ add a note"), act: { kind: "note" } }]
            : [];
    item.entries.forEach((entry, k) => {
      const isCursor = k === this.cursor && !this.editing;
      const isBox = this.isSeveral && entry.kind === "option";
      const rec = entry.isRecommended ? t.fg("dim", " (recommended)") : "";
      // ○ ● for one of many, □ ■ for several of many.
      const box = `${isBox ? (entry.isChosen ? "■" : "□") : entry.isChosen ? "●" : "○"} `;
      // The write-in stands apart from what the question offered, dim until it holds an answer.
      const isWaiting = entry.kind === "write" && !item.written;
      if (entry.kind === "write" && k > 0) rows.push({ text: "" });
      const lines = wrapTextWithAnsi(box + entry.text, Math.max(8, width - 4));
      lines.forEach((line, i) => {
        const pointer = isCursor ? t.fg("accent", "›") : " ";
        const head = i === 0 ? `${pointer}${t.fg("accent", String(k + 1))} ` : "   ";
        const tail = i === lines.length - 1 ? rec : "";
        const body = isCursor
          ? t.fg("accent", line)
          : entry.isChosen
            ? t.fg("success", line)
            : isWaiting
              ? t.fg("dim", line)
              : line;
        rows.push({ text: `${head}${body}${tail}`, act: { kind: "entry", index: k } });
      });
      if (entry.detail)
        rows.push(...this.wrapped(entry.detail, width, (s) => t.fg("dim", s), "   "));
      if (k === noteAt) rows.push(...note);
    });
    if (noteAt < 0) rows.push(...note);
    rows.push({ text: "" });
    if (item.recommended)
      rows.push(...this.wrapped(`${t.fg("dim", "Recommended:")} ${item.recommended}`, width), {
        text: "",
      });
    if (item.written && this.editing !== "text")
      rows.push(...this.wrapped(`${t.fg("dim", "Your answer:")} ${item.written}`, width));
    if (this.editing === "text") rows.push(this.field("answer", width));
    return rows;
  }

  private reviewRows(width: number): Row[] {
    const t = this.theme;
    const rows: Row[] = [];
    this.view.review.forEach((row, i) => {
      const note = row.note ? t.fg("dim", ` — ${row.note}`) : "";
      const key = i < 9 ? t.fg("accent", String(i + 1)) : " ";
      const shown = row.isAnswered ? row.shown : t.fg("dim", row.shown);
      // The question first, then its answer: the title is cut before the answer is.
      const answer = `→ ${shown}${note}`;
      const head = `${key}  ${row.label}  `;
      const room = Math.max(8, width - visibleWidth(head) - visibleWidth(answer) - 2);
      const text = `${head}${truncateToWidth(row.title, room, "…")}  ${answer}`;
      rows.push({ text: truncateToWidth(text, width, "…"), act: { kind: "goto", index: i } });
    });
    rows.push({ text: "" });
    if (this.editing === "note") rows.push(this.field("note", width));
    else if (this.view.note)
      rows.push(...this.wrapped(`${t.fg("dim", "Note:")} ${this.view.note}`, width));
    rows.push({ text: t.fg("dim", "The reply:") });
    // A note's line keeps its indent under the answer it rides on.
    for (const line of (this.view.reply || t.fg("dim", "(nothing answered yet)")).split("\n"))
      rows.push(
        ...this.wrapped(line.trimStart(), width, undefined, `  ${/^ */.exec(line)?.[0] ?? ""}`),
      );
    return rows;
  }

  render(width: number): string[] {
    const t = this.theme;
    const w = Math.max(MIN_WIDTH, width);
    const textWidth = w - 4;
    const { item, isReview: review, step, count } = this.view;
    const chip = (key: string, label: string, act: Act): Chip<Act> => ({ key, label, act });
    const footer = chipRow(
      t,
      review
        ? [
            chip("enter", "fill the prompt", { kind: "fill" }),
            chip("s", "send", { kind: "send" }),
            chip("n", "note", { kind: "note" }),
            chip("b", "back", { kind: "back" }),
          ]
        : [
            chip("b", "back", { kind: "back" }),
            chip("f", "forward", { kind: "forward" }),
            ...(item?.canAccept ? [chip("y", `take ${item.accepts}`, { kind: "accept" })] : []),
            chip("s", "skip", { kind: "skip" }),
            chip("r", "review", { kind: "review" }),
            chip("n", "note", { kind: "note" }),
            ...(item?.canSeveral ? [chip("m", "several", { kind: "several" })] : []),
          ],
    );
    const keys = this.editing
      ? "enter goes on · esc leaves the field"
      : review
        ? "1-9 revisits · esc closes, answers kept"
        : this.isSeveral
          ? "1-9 toggles, f goes on · esc closes, answers kept"
          : "1-9 or enter answers · hjkl moves · esc closes, answers kept";
    this.band = bandShell(t, {
      width: w,
      title: item ? `${step + 1} of ${count}` : "Review",
      // Every question's stops; narrower, just the one on show.
      right: [this.stops(), ...(item ? [{ text: t.fg("dim", item.label) }] : [])],
      maxRows: this.tui.terminal.rows,
      // The tallest question's, so going from one to the next moves nothing.
      height: this.tallest(textWidth),
      body: item ? this.itemRows(item, textWidth) : this.reviewRows(textWidth),
      offset: this.offset,
      footer,
      keys,
    });
    this.offset = this.band.offset;
    return this.band.lines;
  }
}
