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
} from "@earendil-works/pi-tui";
import type { Button } from "../../../kit/buttons/contract.ts";
import { buttonRow } from "../../../kit/buttons/terminal.ts";
import { digitChoice } from "../../../kit/card/contract.ts";
import {
  CARD_INSET,
  choice as choiceRows,
  heading as headingRows,
  note as noteRows,
  NOTE_LABEL,
  railRole,
  sectionsOf,
} from "../../../kit/card/terminal.ts";
import { cellWidth, span, type Span } from "../../../kit/lines.ts";
import { draw, markdownLines, paintedWidth, paintLine, paintText } from "../../../kit/paint/pi.ts";
import { tokens, widthCap } from "../../../kit/tokens.ts";
// No kit part yet: the band's hit map, the gutter note, prose, and `clamp`, which breaks CJK text
// between characters where the kit's wraps at spaces only.
import {
  bandAct,
  cellAt,
  clamp as clampPainted,
  gutterLine,
  note,
  prose,
  type BandRow,
} from "../../../kit/legacy/pi/ui.ts";
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
    const dim = (text: string) => paintText(theme, text, { role: "dim" });
    // A card's own rows stand after the column its parts keep for the pointer.
    const room = inner - cellWidth(CARD_INSET);
    const inset = (text: string) => CARD_INSET + text;
    const asRows = (lines: string[], act?: RoundAction): Row[] =>
      lines.map((text) => ({ text, act }));
    const editRows = (step: number, kind: Field["kind"], label: string): Row[] | undefined => {
      if (!field || field.step !== step || field.kind !== kind) return undefined;
      const width = inner - cellWidth(label);
      const lines = field.editor.render(width).slice(1, -1);
      return lines.map((line, i) => ({
        text: dim(i ? " ".repeat(cellWidth(label)) : label) + line,
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
          ? gutterLine(
              paintText(theme, tokens.glyph.rail, {
                role: railRole({ active: state.here, answered: state.answered }),
              }),
              row.text,
            )
          : gutterLine(dim(tokens.glyph.rail), row.text);
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
      sectionsOf<Row>({ text: "" }, heading, body).forEach(append);
      this.ends[step] = out.length;
    };
    const current = view(round.form, round.draft);
    for (let step = 0; step < current.count; step++) {
      const item = view(round.form, { ...round.draft, step }).item;
      if (!item) continue;
      const here = active && current.step === step;
      const answered = current.review[step]?.isAnswered ?? false;
      const heading = asRows(
        draw(
          theme,
          headingRows(
            { title: item.title, label: item.label, active: here, focused: here, answered },
            inner,
          ),
          inner,
        ),
      );
      const rows: Row[] = [];
      if (item.body) {
        // The original assistant message stays above the cards, with all its Markdown intact.
        const detail = new Markdown(item.body, 0, 0, getMarkdownTheme()).render(room);
        rows.push(...asRows(detail.slice(0, 3).map(inset)));
        if (detail.length > 3)
          rows.push({ text: dim(inset("… full context in the message above")) });
        rows.push({ text: "" });
      }
      const letters = choiceLetters(item);
      item.entries.forEach((entry, index) => {
        if (!active && entry.kind === "write" && !entry.isChosen) return;
        const key = letters[index];
        const editing =
          entry.kind === "write"
            ? editRows(step, "write", `${CARD_INSET}${key || " "} › `)
            : undefined;
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
        // A click on the one chosen answer takes it back, so no row is kept to clear it.
        const action: RoundAction | undefined = !active
          ? undefined
          : entry.isChosen && !item.isSeveral
            ? { kind: "clear", step }
            : { kind: "pick", step, entry: index };
        rows.push(
          ...asRows(
            draw(
              theme,
              choiceRows(
                {
                  key: key ?? "",
                  text,
                  detail: entry.detail,
                  chosen: entry.isChosen,
                  hovered: active && this.hovered?.step === step && this.hovered.entry === index,
                  multiple: item.isSeveral,
                  literal: entry.kind === "write",
                },
                inner,
              ),
              inner,
            ),
            action,
          ),
        );
      });
      // The note stands under the answers; what else the card says follows a blank row.
      const more: Row[] = [];
      if (item.recommended)
        more.push(
          ...asRows(
            markdownLines(theme, `Recommended: ${item.recommended}`, room, { color: dim }, 3).map(
              inset,
            ),
          ),
        );
      if (active && item.accepts.includes(","))
        more.push(
          ...asRows(prose(theme, room, `Take ${item.accepts}`, {}, "dim").map(inset), {
            kind: "accept",
            step,
          }),
        );
      if (active || item.note)
        rows.push(
          ...(editRows(step, "note", CARD_INSET + NOTE_LABEL) ??
            asRows(
              draw(theme, noteRows({ value: item.note, active: here, answered }, inner), inner),
              active ? { kind: "note", step } : undefined,
            )),
        );
      section(step, heading, sectionsOf<Row>({ text: "" }, rows, more), { here, answered });
    }

    const open = active && current.isReview;
    const cursor = state.reviewCursor ?? firstReviewStop(current);
    const tone = (active: boolean, done: boolean, s: string, bold = false) =>
      paintText(theme, s, { role: active || !done ? "text" : "dim", bold: bold || undefined });
    const title = `Answers  ${current.answered} of ${current.count} answered`;
    const sent = round.sent
      ? paintText(theme, ` ${tokens.glyph.done} Sent`, { role: "success" })
      : "";
    const heading = asRows(
      clampPainted(`  ${tone(open, current.answered > 0, title, true)}${sent}`, inner),
    );
    // Keep independent targets on the same line, wrapping only between controls.
    const controls = (leading: string, buttons: { text: string; act: RoundAction }[]) => {
      const rows: Row[] = [];
      let row: Row = { text: leading, cells: [] };
      for (const button of buttons) {
        if (paintedWidth(row.text + indent + button.text) > inner && row.text.trim()) {
          rows.push(row);
          row = { text: " ", cells: [] };
        }
        if (row.text.trim()) row.text += indent;
        const start = paintedWidth(row.text);
        const text = clampPainted(button.text, inner - start, { max: 1 })[0] ?? "";
        row.text += text;
        row.cells!.push({ start, end: paintedWidth(row.text), act: button.act });
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
                  text: tone(
                    open && cursor < 0,
                    true,
                    `[ ${open && cursor < 0 ? tokens.glyph.pointer + " " : ""}Fill prompt ]`,
                    true,
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
      const labelWidth = Math.max(...current.review.map((row) => cellWidth(row.label)));
      const entries = current.review.map((row, step) => {
        const here = open && step === cursor;
        const ink = (text: string) => tone(here, row.isAnswered, text, true);
        const action: RoundAction | undefined = open ? { kind: "go", step } : undefined;
        const prefix =
          `${here ? tokens.glyph.pointer : " "} ${row.label}` +
          " ".repeat(labelWidth - cellWidth(row.label) + tokens.gutter);
        const pad = " ".repeat(cellWidth(prefix));
        const textWidth = inner - cellWidth(prefix);
        const lines = [
          ...asRows(
            clampPainted(
              `${row.title}${row.isAnswered ? ` ${tokens.glyph.done}` : ""}`,
              textWidth,
              {
                max: 3,
              },
            ).map((line, i) => ink((i ? pad : prefix) + line)),
            action,
          ),
          ...asRows(
            clampPainted(row.isAnswered ? row.shown : "Unanswered", textWidth, { max: 3 }).map(
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
    const dim = (text: string) => paintText(this.theme, text, { role: "dim" });
    const label = v.isReview ? "Review" : (v.item?.label ?? "Answer");
    if (columns < 20) return [];
    const size = `${columns}x${this.tui.terminal.rows}`;
    if (this.size && size !== this.size) queueMicrotask(this.onResize);
    this.size = size;
    const gap = " ".repeat(tokens.gutter);
    if (this.field) {
      if (!this.focused) return this.offer(columns, "Resume editing", "");
      return this.shortcuts(
        columns,
        [
          { hotkey: "enter", label: "Save", hit: "key:0", isLit: true },
          { hotkey: "shift+enter", label: "newline" },
          { hotkey: "esc", label: "Cancel", hit: "key:1" },
        ],
        [() => this.handleInput("\r"), () => this.finishEdit()],
      );
    }
    const progressText = `${label}  ${v.answered}/${v.count} answered`;
    const progress = dim(progressText);
    if (!this.focused) return this.offer(columns, "Answer", `${gap}${progress}`);
    const acts: (() => void)[] = [];
    const hint = (hotkey: string, label: string): Button => ({ hotkey, label });
    const action = (hotkey: string, label: string, act: RoundAction): Button => {
      acts.push(() => this.onAction(act));
      return { hotkey, label, hit: `key:${acts.length - 1}` };
    };
    const hints: Button[] = [];
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
    const role = "text";
    return this.shortcuts(columns, hints, acts, [
      v.isReview
        ? span(progressText, { role, bold: true })
        : span(` ${stop} `, { role, inverse: true }),
    ]);
  }

  /** The buttons as rows, and what each does: `acts` by the number in its `hit`. */
  private shortcuts(
    columns: number,
    keys: Button[],
    acts: (() => void)[],
    lead?: Span[],
  ): string[] {
    return buttonRow(keys, columns - 1, { wrap: true, lead, hover: this.hover }).map((row, y) => {
      const { text, cells } = paintLine(this.theme, row, columns - 1);
      this.hits.set(y, {
        text,
        cells: cells.map((cell) => ({
          start: cell.start,
          end: cell.end,
          act: acts[Number(cell.hit.slice(4))]!,
        })),
      });
      return ` ${text}`;
    });
  }

  private offer(columns: number, label: string, suffix: string): string[] {
    const act = () => this.onAction({ kind: "focus" });
    const [row] = buttonRow(
      [{ hotkey: "alt+a", label, hit: "key:0", essential: true }],
      columns - 1,
      {
        hover: this.hover,
      },
    );
    const painted = paintLine(this.theme, row!, columns - 1);
    this.hits.set(0, {
      text: painted.text,
      cells: painted.cells.map((cell) => ({ start: cell.start, end: cell.end, act })),
    });
    return clampPainted(` ${painted.text}${suffix}`, columns, { max: 1 });
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
