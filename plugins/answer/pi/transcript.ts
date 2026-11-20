import { getMarkdownTheme, getSelectListTheme, type Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Container,
  Editor,
  type Focusable,
  Markdown,
  matchesKey,
  ScrollView,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  visibleWidth,
} from "@earendil-works/pi-tui";
import {
  bandAct,
  buttonRow,
  type KeyChip,
  CARD_NOTE_LABEL,
  cardChoice,
  cardHeading,
  cardNote,
  cardRail,
  cardSections,
  cardTone as questionTone,
  cellAt,
  clamp,
  digitChoice,
  gutterLine,
  markdownLines,
  note,
  paint,
  prose,
  tokens,
  widthCap,
  type BandRow,
} from "../../../kit/pi/ui.ts";
import { type Held, type View, view, viewOf } from "../core/forms.ts";

export type Round = Held & { anchor?: string; sent?: boolean };
export type RoundAction =
  | { kind: "pick"; step: number; entry: number }
  | { kind: "go" | "note" | "clear" | "accept"; step: number }
  | { kind: "move"; delta: -1 | 1 }
  | { kind: "review-cursor"; index: number }
  | { kind: "fill" | "send" | "review" | "review-toggle" | "review-open" | "release" | "focus" };

type Row = BandRow<RoundAction> & { editorWidth?: number };
type Field = { kind: "write" | "note"; step: number; editor: Editor };
type Item = NonNullable<View["item"]>;
const REVIEW_PAGE = 5;
export const firstReviewStop = (v: View) => (v.reply ? -1 : 0);

const choiceLetters = (item: Item): string[] => {
  const unused = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].filter(
    (letter) => !item.entries.some((entry) => entry.key === letter),
  );
  return item.entries.map((entry) => entry.key || unused.shift() || "");
};

/** One entry per round. Redraw it from current state rather than appending copies as it changes. */
export class Transcript implements Component {
  private hits = new Map<number, Row>();
  private stops: number[] = [];
  private ends: number[] = [];
  private reviewSelection?: [number, number];
  private hovered?: Extract<RoundAction, { kind: "pick" }>;
  private input?: { field: Field; first: number; x: number; width: number; height: number };

  constructor(
    private readonly theme: Theme,
    private readonly read: () =>
      | {
          round: Round;
          active: boolean;
          terminalRows: number;
          reviewCursor?: number;
          field?: Field;
        }
      | undefined,
    private readonly onAction: (action: RoundAction) => void,
  ) {}

  invalidate(): void {}

  span(step: number): [number, number] | undefined {
    if (this.input?.field.step === step)
      return [this.input.first, this.input.first + this.input.height];
    const start = this.stops[step];
    const end = this.ends[step];
    return start === undefined || end === undefined ? undefined : [start, end];
  }

  selection(): [number, number] | undefined {
    return this.reviewSelection;
  }

  render(columns: number): string[] {
    this.hits.clear();
    this.stops = [];
    this.ends = [];
    this.reviewSelection = undefined;
    this.input = undefined;
    const state = this.read();
    if (!state || columns < 20) return [];
    const { round, active, field } = state;
    const { theme } = this;
    // Match the assistant transcript's left inset and leave room for Pi's scrollbar.
    const width = widthCap("reading", columns - tokens.gutter);
    const indent = " ".repeat(tokens.gutter);
    const inner = Math.min(width - tokens.gutter, tokens.prose);
    const out: string[] = [];
    const dim = (text: string) => paint(theme, "dim", text);
    const asRows = (lines: string[], act?: RoundAction): Row[] =>
      lines.map((text) => ({ text, act }));
    const editRows = (step: number, kind: Field["kind"], label: string): Row[] | undefined => {
      if (!field || field.step !== step || field.kind !== kind) return undefined;
      const width = inner - visibleWidth(label);
      const lines = field.editor.render(width).slice(1, -1);
      return lines.map((line, i) => ({
        text: dim(i ? " ".repeat(visibleWidth(label)) : label) + line,
        editorWidth: width,
      }));
    };
    const section = (
      step: number,
      heading: Row[],
      body: Row[],
      state?: { here: boolean; answered: boolean },
    ) => {
      if (out.length) out.push("", "");
      this.stops[step] = out.length;
      const append = (row: Row) => {
        const text = state
          ? cardRail(theme, state.here, state.answered, row.text)
          : gutterLine(dim(tokens.border.v), row.text);
        if (row.editorWidth !== undefined && field) {
          if (this.input) this.input.height++;
          else
            this.input = {
              field,
              first: out.length,
              x: 1 + tokens.gutter + inner - row.editorWidth,
              width: row.editorWidth,
              height: 1,
            };
        } else if (row.act || row.cells) {
          // bandAct measures chip ranges from column one; the rail adds the gutter.
          const cells = row.cells?.map(({ start, end, act }) => ({
            start: start + tokens.gutter,
            end: end + tokens.gutter,
            act,
          }));
          this.hits.set(out.length, { ...row, text, cells });
        }
        out.push(text);
      };
      cardSections<Row>({ text: "" }, heading, body).forEach(append);
      this.ends[step] = out.length;
    };
    const current = view(round.form, round.draft);
    for (let step = 0; step < current.count; step++) {
      const item = view(round.form, { ...round.draft, step }).item;
      if (!item) continue;
      const here = active && current.step === step;
      const answered = current.review[step]?.isAnswered ?? false;
      const heading = asRows(cardHeading(theme, inner, item.title, item.label, here, answered));
      const rows: Row[] = [];
      if (item.body) {
        // The original assistant message stays above the cards, with all its Markdown intact.
        const detail = new Markdown(item.body, 0, 0, getMarkdownTheme()).render(inner);
        rows.push(...asRows(detail.slice(0, 3)));
        if (detail.length > 3) rows.push({ text: dim("… full context in the message above") });
        rows.push({ text: "" });
      }
      const letters = choiceLetters(item);
      item.entries.forEach((entry, index) => {
        if (!active && entry.kind === "write" && !entry.isChosen) return;
        const key = letters[index];
        const editing =
          entry.kind === "write" ? editRows(step, "write", `${key || " "} › `) : undefined;
        if (editing) {
          rows.push(...editing);
          return;
        }
        const text =
          entry.kind === "write" && item.written
            ? item.written
            : entry.key && entry.text.startsWith(`${entry.key}. `)
              ? entry.text.slice(entry.key.length + 2)
              : entry.text;
        const action: RoundAction | undefined = active
          ? { kind: "pick", step, entry: index }
          : undefined;
        rows.push(
          ...asRows(
            cardChoice(theme, inner, {
              key: key ?? "",
              text,
              detail: entry.detail,
              chosen: entry.isChosen,
              focused: active && this.hovered?.step === step && this.hovered.entry === index,
              active: here,
              answered,
              literal: entry.kind === "write",
            }),
            action,
          ),
        );
      });
      if (item.recommended)
        rows.push(
          { text: "" },
          ...asRows(
            markdownLines(theme, `Recommended: ${item.recommended}`, inner, { color: dim }, 3),
          ),
        );
      if (active && (answered || item.accepts.includes(","))) rows.push({ text: "" });
      if (active && item.accepts.includes(","))
        rows.push(
          ...asRows(prose(theme, inner, `Take ${item.accepts}`, {}, "dim"), {
            kind: "accept",
            step,
          }),
        );
      if (answered && active)
        rows.push({ text: dim("Clear answer"), act: { kind: "clear", step } });
      if (active || item.note) {
        const note =
          editRows(step, "note", CARD_NOTE_LABEL) ??
          asRows(
            cardNote(theme, inner, item.note, here, answered),
            active ? { kind: "note", step } : undefined,
          );
        section(step, heading, cardSections<Row>({ text: "" }, rows, note), { here, answered });
      } else {
        section(step, heading, rows, { here, answered });
      }
    }

    const open = active && current.isReview;
    const cursor = state.reviewCursor ?? firstReviewStop(current);
    const tone = (s: string) => questionTone(theme, open, current.answered > 0, s);
    const title = `Answers  ${current.answered} of ${current.count} answered`;
    const sent = round.sent ? theme.fg("success", ` ${tokens.glyph.done} Sent`) : "";
    const heading = asRows(clamp(`  ${theme.bold(tone(title))}${sent}`, inner));
    // Keep independent targets on the same line, wrapping only between controls.
    const controls = (leading: string, buttons: { text: string; act: RoundAction }[]) => {
      const rows: Row[] = [];
      let row: Row = { text: leading, cells: [] };
      for (const button of buttons) {
        if (visibleWidth(row.text + indent + button.text) > inner && row.text.trim()) {
          rows.push(row);
          row = { text: " ", cells: [] };
        }
        if (row.text.trim()) row.text += indent;
        const start = visibleWidth(row.text);
        const text = clamp(button.text, inner - start, { max: 1 })[0] ?? "";
        row.text += text;
        row.cells!.push({ start, end: visibleWidth(row.text), act: button.act });
      }
      rows.push(row);
      return rows;
    };
    if (active) {
      const toggle = open
        ? "▾ Hide questions"
        : `▸ Show ${current.count === 1 ? "question" : `all ${current.count} questions`}`;
      heading.push(
        ...controls(" ", [
          ...(current.reply
            ? [
                {
                  text: theme.bold(
                    questionTone(
                      theme,
                      open && cursor < 0,
                      true,
                      `[ ${open && cursor < 0 ? tokens.glyph.pointer + " " : ""}Fill prompt ]`,
                    ),
                  ),
                  act: { kind: "fill" } as const,
                },
              ]
            : []),
          { text: dim(toggle), act: { kind: "review-toggle" } },
        ]),
      );
    }

    const review: Row[] = [];
    let selected: [number, number] | undefined;
    if (open || round.sent) {
      const labelWidth = Math.max(...current.review.map((row) => visibleWidth(row.label)));
      const entries = current.review.map((row, step) => {
        const here = open && step === cursor;
        const ink = (text: string) => theme.bold(questionTone(theme, here, row.isAnswered, text));
        const action: RoundAction | undefined = open ? { kind: "go", step } : undefined;
        const prefix =
          `${here ? tokens.glyph.pointer : " "} ${row.label}` +
          " ".repeat(labelWidth - visibleWidth(row.label) + tokens.gutter);
        const pad = " ".repeat(visibleWidth(prefix));
        const textWidth = inner - visibleWidth(prefix);
        const lines = [
          ...asRows(
            clamp(`${row.title}${row.isAnswered ? ` ${tokens.glyph.done}` : ""}`, textWidth, {
              max: 3,
            }).map((line, i) => ink((i ? pad : prefix) + line)),
            action,
          ),
          ...asRows(
            clamp(row.isAnswered ? row.shown : "Unanswered", textWidth, { max: 3 }).map(
              (line) => pad + (row.isAnswered ? ink(line) : dim(line)),
            ),
            action,
          ),
        ];
        if (row.note)
          lines.push(
            ...asRows(
              prose(theme, textWidth, `Note: ${row.note}`, { max: 2 }, "dim").map(
                (line) => pad + line,
              ),
              action,
            ),
          );
        return lines;
      });

      let start = 0;
      let end = entries.length;
      if (open) {
        // Keep entries whole on short screens. Leave room for the guide, prompt, and Pi chrome.
        const budget = Math.max(1, state.terminalRows - heading.length - 11);
        const pages = [0];
        let used = 0;
        for (const [i, lines] of entries.entries()) {
          const first = pages.at(-1)!;
          if (i > first && (used + lines.length > budget || i - first === REVIEW_PAGE)) {
            pages.push(i);
            used = 0;
          }
          used += lines.length;
        }
        let page = 0;
        while ((pages[page + 1] ?? Infinity) <= cursor) page++;
        start = pages[page]!;
        end = pages[page + 1] ?? entries.length;
        const previous = pages[page - 1];
        if (pages.length > 1)
          review.push(
            ...controls(dim(` Questions ${start + 1}–${end} of ${current.count}`), [
              ...(previous === undefined
                ? []
                : [{ text: "Previous", act: { kind: "review-cursor", index: previous } as const }]),
              ...(end < entries.length
                ? [{ text: "Next", act: { kind: "review-cursor", index: end } as const }]
                : []),
            ]),
          );
      }
      for (let step = start; step < end; step++) {
        const first = review.length;
        review.push(...entries[step]!);
        if (open && step === cursor) selected = [first, review.length];
      }
      const roundNote = editRows(current.count, "note", "Round note: ");
      if (roundNote || current.note) {
        review.push(
          { text: "" },
          ...(roundNote ??
            asRows(
              note(theme, inner, current.note),
              open ? { kind: "note", step: current.count } : undefined,
            )),
        );
      }
    }
    section(current.count, heading, review, { here: open, answered: current.answered > 0 });
    if (selected) {
      const body = this.stops[current.count]! + heading.length + 1;
      this.reviewSelection = [body + selected[0], body + selected[1]];
    }
    return out;
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const input = this.input;
    if (
      input &&
      event.y >= input.first &&
      event.y < input.first + input.height &&
      event.x >= 1 + tokens.gutter &&
      event.x < input.x + input.width &&
      event.type === "click" &&
      event.button === "left"
    ) {
      this.onAction({ kind: "focus" });
      input.field.editor.handleMouse({
        ...event,
        x: Math.max(0, event.x - input.x),
        y: event.y - input.first + 1,
        width: input.width,
        height: input.height + 2,
      });
      return { handled: true };
    }
    const action =
      event.x < 1 + tokens.gutter ? undefined : bandAct({ hits: this.hits }, event.x, event.y);
    if (event.type === "move") {
      const next = action?.kind === "pick" ? action : undefined;
      const changed = this.hovered?.step !== next?.step || this.hovered?.entry !== next?.entry;
      this.hovered = next;
      return changed ? { render: true } : undefined;
    }
    if (!action || event.button !== "left") return undefined;
    if (event.type === "click") this.onAction(action);
    return event.type === "press" || event.type === "click" ? { handled: true } : undefined;
  }
}

/** The prompt normally owns the keyboard. Alt+a hands it to the guide until Esc or a prompt click. */
export class AnswerGuide implements Component, Focusable {
  private hits = new Map<number, BandRow<() => void>>();
  private hover?: { x: number; y: number };
  private isFocused = false;
  private size: string | undefined;
  private field?: Field & { done: (text?: string) => void };

  get activeField(): Field | undefined {
    return this.field;
  }

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly read: () => Held | null,
    private readonly reviewCursor: () => number | undefined,
    private readonly onAction: (action: RoundAction) => void,
    private readonly onResize: () => void,
  ) {}

  get focused(): boolean {
    return this.isFocused;
  }
  set focused(value: boolean) {
    this.isFocused = value;
    if (this.field) this.field.editor.focused = value;
    this.tui.requestRender();
  }

  get editing(): boolean {
    return this.field !== undefined;
  }

  edit(kind: Field["kind"], step: number, text: string, done: (text?: string) => void): void {
    const editor = new Editor(this.tui, {
      borderColor: (s) => this.theme.fg("borderAccent", s),
      selectList: getSelectListTheme(),
    });
    editor.setText(text);
    editor.focused = this.focused;
    editor.onSubmit = (value) => this.finishEdit(value);
    this.field = { kind, step, editor, done };
    this.tui.requestRender();
  }

  private finishEdit(text?: string): void {
    const field = this.field;
    this.field = undefined;
    field?.done(text);
    this.tui.requestRender();
  }

  invalidate(): void {
    this.field?.editor.invalidate();
  }

  private actionFor(data: string, v: View): RoundAction | undefined {
    if (matchesKey(data, "escape") || matchesKey(data, "alt+a")) return { kind: "release" };
    if (data === "r") return { kind: "review" };
    if (data === "n") return { kind: "note", step: v.step };
    if (data === "j" || data === "k") return { kind: "move", delta: data === "j" ? 1 : -1 };
    if (v.isReview) {
      if (matchesKey(data, "enter")) return { kind: "review-open" };
      if (v.reply && data === "f") return { kind: "fill" };
      if (v.reply && data === "s") return { kind: "send" };
    }
    if (v.item && v.review[v.step]?.isAnswered && data === "x")
      return { kind: "clear", step: v.step };
    if (v.item?.accepts.includes(",") && data === "y") return { kind: "accept", step: v.step };
    if (!v.item) return undefined;
    const digit = digitChoice(data);
    const entry = digit >= 0 ? digit : choiceLetters(v.item).indexOf(data.toUpperCase());
    return entry < 0 || !v.item.entries[entry] ? undefined : { kind: "pick", step: v.step, entry };
  }

  handleInput(data: string): void {
    if (this.field) {
      if (matchesKey(data, "escape")) this.finishEdit();
      else this.field.editor.handleInput(data);
      this.tui.requestRender();
      if (this.field) this.onResize();
      return;
    }
    const v = viewOf(this.read());
    if (!v) return;
    const action = this.actionFor(data, v);
    if (action) this.onAction(action);
  }

  render(columns: number): string[] {
    this.hits.clear();
    const v = viewOf(this.read());
    if (!v) return [];
    const dim = (text: string) => paint(this.theme, "dim", text);
    const label = v.isReview ? "Review" : (v.item?.label ?? "Answer");
    if (columns < 20) return [];
    const size = `${columns}x${this.tui.terminal.rows}`;
    if (this.size && size !== this.size) queueMicrotask(this.onResize);
    this.size = size;
    const gap = " ".repeat(tokens.gutter);
    if (this.field) {
      if (!this.focused) return this.offer(columns, "Resume editing", "");
      return this.shortcuts(columns, [
        {
          hotkey: "enter",
          label: "Save",
          act: () => this.handleInput("\r"),
          isLit: true,
        },
        { hotkey: "shift+enter", label: "newline" },
        { hotkey: "esc", label: "Cancel", act: () => this.finishEdit() },
      ]);
    }
    const progressText = `${label}  ${v.answered}/${v.count} answered`;
    const progress = dim(progressText);
    if (!this.focused) return this.offer(columns, "Answer", `${gap}${progress}`);
    const hint = (hotkey: string, label: string): KeyChip<() => void> => ({ hotkey, label });
    const action = (hotkey: string, label: string, act: RoundAction): KeyChip<() => void> => ({
      hotkey,
      label,
      act: () => this.onAction(act),
    });
    const hints: KeyChip<() => void>[] = [];
    if (v.item) {
      const item = v.item;
      const letters = choiceLetters(item);
      const picks = letters.filter((key, i) => key && item.entries[i]?.kind !== "write");
      const write = letters.find((_, i) => item.entries[i]?.kind === "write");
      const consecutive = picks.every(
        (key, i) => i === 0 || key.charCodeAt(0) === picks[i - 1]!.charCodeAt(0) + 1,
      );
      if (picks.length)
        hints.push(
          hint(
            picks.length > 1 && consecutive ? `${picks[0]}–${picks.at(-1)}` : picks.join("/"),
            "pick",
          ),
        );
      if (write)
        hints.push(
          action(write, "Write", { kind: "pick", step: v.step, entry: letters.indexOf(write) }),
        );
    } else {
      const cursor = this.reviewCursor() ?? firstReviewStop(v);
      hints.push({
        ...action("enter", cursor < 0 ? "Fill" : "Open", { kind: "review-open" }),
        isLit: true,
      });
      if (v.reply) {
        if (cursor >= 0) hints.push(action("f", "Fill", { kind: "fill" }));
        hints.push(action("s", "Send", { kind: "send" }));
      }
    }
    hints.push(
      action("n", "Note", { kind: "note", step: v.step }),
      action("r", v.isReview ? "Back" : "Review", { kind: "review" }),
      action("esc", "Prompt", { kind: "release" }),
      hint("jk", "move"),
    );
    if (v.item && v.review[v.step]?.isAnswered)
      hints.push(action("x", "Clear", { kind: "clear", step: v.step }));
    if (v.item?.accepts.includes(","))
      hints.push(action("y", "Take recommendation", { kind: "accept", step: v.step }));
    const digits = String(v.count).length;
    const stop = `${String(v.step + 1).padStart(digits, "0")}/${v.count}`;
    const badge = questionTone(
      this.theme,
      true,
      false,
      v.isReview ? this.theme.bold(progressText) : this.theme.inverse(` ${stop} `),
    );
    return this.shortcuts(columns, hints, badge);
  }

  private shortcuts(columns: number, keys: KeyChip<() => void>[], lead?: string): string[] {
    return buttonRow(this.theme, columns - 1, keys, { wrap: true, lead, hover: this.hover }).map(
      (row, y) => {
        this.hits.set(y, row);
        return ` ${row.text}`;
      },
    );
  }

  private offer(columns: number, label: string, suffix: string): string[] {
    const [row] = buttonRow(
      this.theme,
      columns - 1,
      [{ hotkey: "alt+a", label, act: () => this.onAction({ kind: "focus" }), essential: true }],
      { hover: this.hover },
    );
    this.hits.set(0, row!);
    return clamp(` ${row!.text}${suffix}`, columns, { max: 1 });
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const cell = cellAt(this.hits.get(event.y)?.cells, event.x - 1);
    if (event.type === "move") {
      const next = cell && { x: cell.start, y: event.y };
      const changed = this.hover?.x !== next?.x || this.hover?.y !== next?.y;
      this.hover = next;
      return changed ? { render: true } : undefined;
    }
    const action = cell?.act;
    if (!action || event.button !== "left") return undefined;
    if (event.type === "click") action();
    return event.type === "press" || event.type === "click" ? { handled: true } : undefined;
  }
}

/** Pi has no extension API for scrolling to an entry. If its viewport internals change, the
 * cards are still reachable through ordinary scrollback, and the guide still works. */
export function reveal(
  tui: TUI,
  card: Transcript,
  step: number,
  align: "start" | "end" | "nearest",
): boolean {
  const primary: unknown = Reflect.get(tui, "getPrimaryScrollView");
  if (typeof primary !== "function") return true; // Unsupported viewport; keep manual scrolling.
  tui.renderNow();
  const scroll: unknown = primary.call(tui);
  if (!(scroll instanceof ScrollView)) return true;
  const width = scroll.getContentWidth(tui.terminal.columns);
  function locate(component: Component): number | undefined {
    if (component === card) return 0;
    if (!(component instanceof Container)) return undefined;
    let preceding = 0;
    for (const child of component.children) {
      const found = locate(child);
      if (found !== undefined) return preceding + found;
      preceding += child.render(width).length;
    }
    return undefined;
  }
  const offset = locate(scroll);
  const span = card.span(step);
  if (offset === undefined || !span) return false;
  const start = offset + span[0];
  const end = offset + span[1] - scroll.viewportHeight;
  const selection = card.selection();
  if (align === "nearest" && selection && end > start) {
    // Keep the header in view when it fits; scroll to the selected row for tall pages.
    const first = offset + selection[0];
    const last = offset + selection[1] - scroll.viewportHeight;
    scroll.scrollTo(Math.max(start, Math.min(first, last)));
  } else if (align === "nearest" && end <= start) {
    const top = Math.max(end, Math.min(start, scroll.scrollTop));
    if (top !== scroll.scrollTop) scroll.scrollTo(top);
  } else {
    scroll.scrollTo(align === "end" ? Math.max(start, end) : start);
  }
  return true;
}
