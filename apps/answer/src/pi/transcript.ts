import { getSelectListTheme, type Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Editor,
  type Focusable,
  matchesKey,
  ScrollView,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import type { Button } from "@agents/kit-buttons/contract.ts";
import { buttonRow } from "@agents/kit-buttons/terminal.ts";
import { digitChoice } from "@agents/kit-card/contract.ts";
import {
  CARD_INSET,
  choice as choiceRows,
  closing as closingRows,
  heading as headingRows,
  note as noteRows,
  NOTE_LABEL,
  rail,
  sectionsOf,
} from "@agents/kit-card/terminal.ts";
import {
  cellWidth,
  hitSpans,
  line,
  span,
  truncateSpans,
  type Line,
  type Span,
} from "@agents/kit-core/lines.ts";
import { markdownLines, paintLine, paintSpan } from "@agents/kit-core/paint/pi.ts";
import { tokens, widthCap } from "@agents/kit-core/tokens.ts";
import { prose } from "@agents/kit-prose/terminal.ts";
import { type Held, type View, view, viewOf } from "../lib/forms.ts";

export type Round = Held & { anchor?: string; sent?: boolean };
export type RoundAction =
  | { kind: "pick"; step: number; entry: number }
  | { kind: "go" | "note" | "clear" | "accept"; step: number }
  | { kind: "move"; delta: -1 | 1 }
  /** Back to the first question, scrolled to the top of the round. */
  | { kind: "top" }
  | { kind: "fill" | "send" | "review" | "release" | "focus" };

/** One drawn row of a card; `editorWidth` marks the rows a prompt field fills. */
type Row = { line: Line; editorWidth?: number };
/** A control on a painted row: its cells, and what pressing it does. */
type ActCell<A> = { start: number; end: number; act: A };
type Hit<A> = { text: string; cells: ActCell<A>[] };
/** An open field's address: the form and step it belongs to, and what it is. */
export type Typing = { form: string; kind: "write" | "note"; step: number };
/** An open field and what is in it: what a redraw has to give back, and to which round. */
export type Typed = Typing & { text: string };
type Field = Typing & { editor: Editor };
type Item = NonNullable<View["item"]>;

/** The control at `x` on a row, if the pointer is over one. */
const cellAt = <A>(cells: readonly ActCell<A>[], x: number) =>
  cells.find((cell) => x >= cell.start && x < cell.end);
const atCell = <A>(cells: readonly ActCell<A>[], x: number) => cellAt(cells, x)?.act;

const choiceLetters = (item: Item): string[] => {
  // A list of alternatives printed its numbers, so its write-in takes the next number.
  const isNumbered = item.entries.some((entry) => /^[1-9]$/.test(entry.key));
  const unused = [...(isNumbered ? "123456789" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ")].filter(
    (letter) => !item.entries.some((entry) => entry.key === letter),
  );
  return item.entries.map((entry) => entry.key || unused.shift() || "");
};

/** One entry per round. Redraw it from current state rather than appending copies as it changes. */
export class Transcript implements Component {
  private hits = new Map<number, Hit<RoundAction>>();
  private stops: number[] = [];
  private ends: number[] = [];
  /** The control under the mouse. */
  private hovered?: RoundAction;
  private input?: { field: Field; first: number; x: number; width: number; height: number };

  constructor(
    private readonly theme: Theme,
    private readonly read: () =>
      | {
          round: Round;
          active: boolean;
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

  render(columns: number): string[] {
    this.hits.clear();
    this.stops = [];
    this.ends = [];
    this.input = undefined;
    const state = this.read();
    if (!state || columns < 20) return [];
    const { round, active, field } = state;
    const { theme } = this;
    // Match the assistant transcript's left inset and leave room for Pi's scrollbar.
    const width = widthCap("reading", columns - tokens.gutter);
    const inner = Math.min(width - tokens.gutter, tokens.prose);
    const out: string[] = [];
    // A card's own rows stand after the column its parts keep for the pointer.
    const room = inner - cellWidth(CARD_INSET);
    const inset = (spans: Span[]): Line => line([span(CARD_INSET), ...spans]);
    // Every control on this drawing, by the hit its painted cells carry. A row that is one
    // control hands the same hit to all of its words, so the rail and the room after it stay
    // pi's: a click there does nothing, as it did when the rows carried an action whole.
    const actions = new Map<string, RoundAction>();
    let rowHits = 0;
    const asRows = (lines: Line[], act?: RoundAction): Row[] =>
      lines.map((drawn) => {
        if (!act) return { line: drawn };
        const hit = `row:${rowHits++}`;
        actions.set(hit, act);
        return { line: { ...drawn, spans: hitSpans(drawn.spans, hit) } };
      });
    const editRows = (step: number, kind: Field["kind"], label: string): Row[] | undefined => {
      if (!field || field.step !== step || field.kind !== kind) return undefined;
      const labelWidth = cellWidth(label);
      const editorWidth = inner - labelWidth;
      const lines = field.editor.render(editorWidth).slice(1, -1);
      return lines.map((text, i) => ({
        line: line([span(i ? " ".repeat(labelWidth) : label, { role: "dim" }), span(text)]),
        editorWidth,
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
        // The rail and its gutter are measured by the painter, so a painted field's own escapes
        // never reach a width count: only the cells a control was given are read back.
        const painted = paintLine(
          theme,
          rail({ active: state?.here, answered: state?.answered }, row.line),
          inner + 1 + tokens.gutter,
        );
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
        }
        const cells = painted.cells.flatMap((cell) => {
          const act = actions.get(cell.hit);
          return act ? [{ start: cell.start, end: cell.end, act }] : [];
        });
        if (cells.length) this.hits.set(out.length, { text: painted.text, cells });
        out.push(painted.text);
      };
      sectionsOf<Row>({ line: line([]) }, heading, body).forEach(append);
      this.ends[step] = out.length;
    };
    const current = view(round.form, round.draft);
    for (let step = 0; step < current.count; step++) {
      const item = view(round.form, { ...round.draft, step }).item;
      if (!item) continue;
      const here = active && current.step === step;
      const answered = current.review[step]?.isAnswered ?? false;
      const heading = asRows(
        headingRows(
          { title: item.title, label: item.label, active: here, focused: here, answered },
          inner,
        ),
      );
      const rows: Row[] = [];
      // A round's body is not repeated: pi keeps the assistant message above the cards with its own
      // Markdown, so a second copy is either a block cut in half or the whole text twice. A pick
      // list's body is its row's own line (the size, the route), which the row wording does not say.
      if (round.form.kind === "picks" && item.body) {
        const detail = markdownLines(theme, item.body, room);
        rows.push(...asRows(detail.map((text) => inset([span(text)]))));
        rows.push({ line: line([]) });
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
            choiceRows(
              {
                key: key ?? "",
                text,
                detail: entry.detail,
                aside: entry.isRecommended ? "  Recommended" : undefined,
                chosen: entry.isChosen,
                hovered:
                  active &&
                  this.hovered?.kind === "pick" &&
                  this.hovered.step === step &&
                  this.hovered.entry === index,
                active: here,
                multiple: item.isSeveral,
                literal: entry.kind === "write",
              },
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
            markdownLines(
              theme,
              `Recommended: ${item.recommended}`,
              room,
              { color: (text) => paintSpan(theme, span(text, { role: "dim" })) },
              3,
            ).map((text) => inset([span(text)])),
          ),
        );
      if (active && item.accepts.includes(","))
        more.push(
          ...asRows(
            prose({ text: `Take ${item.accepts}`, width: room, isDim: true }).map((drawn) =>
              inset(drawn.spans),
            ),
            { kind: "accept", step },
          ),
        );
      if (active || item.note)
        rows.push(
          ...(editRows(step, "note", CARD_INSET + NOTE_LABEL) ??
            asRows(
              noteRows(
                {
                  value: item.note,
                  active: here,
                  answered,
                  hovered: this.hovered?.kind === "note" && this.hovered.step === step,
                },
                inner,
              ),
              active ? { kind: "note", step } : undefined,
            )),
        );
      section(step, heading, sectionsOf<Row>({ line: line([]) }, rows, more), { here, answered });
    }

    // The row after the last card: the count goes back to the first question, Fill puts the
    // reply in the prompt, and the round's note stands under it once it has words.
    const last = active && current.isReview;
    const ends: RoundAction[] = [
      { kind: "top" },
      { kind: "fill" },
      { kind: "note", step: current.count },
    ];
    ends.forEach((action, i) => actions.set(String(i), action));
    const hovered = this.hovered;
    const editingNote = editRows(current.count, "note", CARD_INSET + NOTE_LABEL);
    const closingRow: Row[] = [
      ...closingRows(
        {
          answered: current.answered,
          total: current.count,
          focused: last,
          hovered:
            hovered?.kind === "top" ? "count" : hovered?.kind === "fill" ? "fill" : undefined,
          canFill: !!current.reply,
          sent: round.sent,
          hits: active ? { count: "0", fill: "1" } : undefined,
        },
        inner,
      ),
      ...(current.note && !editingNote
        ? noteRows(
            {
              value: current.note,
              active: last,
              hovered: hovered?.kind === "note" && hovered.step === current.count,
              hit: active ? "2" : undefined,
            },
            inner,
          )
        : []),
    ].map((drawn) => ({ line: drawn }));
    section(current.count, [...closingRow, ...(editingNote ?? [])], [], {
      here: last,
      // The rail says what a card's does: answered once every question is.
      answered: current.answered === current.count,
    });
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
    const action = atCell(this.hits.get(event.y)?.cells ?? [], event.x);
    if (event.type === "move") {
      const changed = JSON.stringify(this.hovered) !== JSON.stringify(action);
      this.hovered = action;
      // pi drops a result that is not `handled`, and its `render` with it.
      return changed ? { handled: true, render: true } : undefined;
    }
    if (!action || event.button !== "left") return undefined;
    if (event.type === "click") this.onAction(action);
    return event.type === "press" || event.type === "click" ? { handled: true } : undefined;
  }
}

/** The prompt normally owns the keyboard. Alt+a hands it to the guide until Esc or a prompt click. */
export class AnswerGuide implements Component, Focusable {
  private hits = new Map<number, Hit<() => void>>();
  private hover?: { x: number; y: number };
  private isFocused = false;
  private size: string | undefined;
  private field?: Field & { done: (text?: string) => void };

  get activeField(): Field | undefined {
    return this.field;
  }

  /** What the open field holds, and the form it belongs to, for a redraw that takes it away. */
  get typed(): Typed | undefined {
    const field = this.field;
    if (!field) return undefined;
    const { form, kind, step } = field;
    return { form, kind, step, text: field.editor.getText() };
  }

  /** Drops the open field without saving it: its text has gone to the round it was typed into. */
  forget(): void {
    if (!this.field) return;
    this.field = undefined;
    this.tui.requestRender();
  }

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly read: () => Held | null,
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

  edit(
    field: Typing,
    text: string,
    done: (text?: string) => void,
    changed?: (text: string) => void,
  ): void {
    const editor = new Editor(this.tui, {
      borderColor: (s) => paintSpan(this.theme, span(s, { role: "border" })),
      selectList: getSelectListTheme(),
    });
    editor.setText(text);
    editor.focused = this.focused;
    editor.onSubmit = (value) => this.finishEdit(value);
    // The prefill is the draft as it already was: only what follows it is worth keeping.
    if (changed) editor.onChange = changed;
    this.field = { ...field, editor, done };
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
      if (matchesKey(data, "enter")) return v.reply ? { kind: "fill" } : { kind: "top" };
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
    const label = v.isReview ? "Review" : (v.item?.label ?? "Answer");
    if (columns < 20) return [];
    const size = `${columns}x${this.tui.terminal.rows}`;
    if (this.size && size !== this.size) queueMicrotask(this.onResize);
    this.size = size;
    const gap = " ".repeat(tokens.gutter);
    if (this.field) {
      if (!this.focused) return this.offer(columns, "Resume editing", []);
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
    if (!this.focused)
      return this.offer(columns, "Answer", [span(gap), span(progressText, { role: "dim" })]);
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
      // The last step offers the reply; with none yet, Enter goes back to the first question.
      hints.push({
        ...(v.reply
          ? action("enter", "Fill", { kind: "fill" })
          : action("enter", "First question", { kind: "top" })),
        isLit: true,
      });
      if (v.reply) hints.push(action("s", "Send", { kind: "send" }));
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
        cells: cells.flatMap((cell) => {
          const act = acts[Number(cell.hit.slice(4))];
          return act ? [{ start: cell.start, end: cell.end, act }] : [];
        }),
      });
      return ` ${text}`;
    });
  }

  /** The one row that offers the keys, with what follows it on the row, cut to the component. */
  private offer(columns: number, label: string, suffix: Span[]): string[] {
    const act = () => this.onAction({ kind: "focus" });
    const [row] = buttonRow(
      [{ hotkey: "alt+a", label, hit: "key:0", essential: true }],
      columns - 1,
      {
        hover: this.hover,
      },
    );
    const painted = paintLine(
      this.theme,
      line(truncateSpans([...(row?.spans ?? []), ...suffix], columns - 1)),
      columns - 1,
    );
    this.hits.set(0, {
      text: painted.text,
      cells: painted.cells.map((cell) => ({ start: cell.start, end: cell.end, act })),
    });
    return [` ${painted.text}`];
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const cell = cellAt(this.hits.get(event.y)?.cells ?? [], event.x - 1);
    if (event.type === "move") {
      const next = cell && { x: cell.start, y: event.y };
      const changed = this.hover?.x !== next?.x || this.hover?.y !== next?.y;
      this.hover = next;
      // pi drops a result that is not `handled`, and its `render` with it.
      return changed ? { handled: true, render: true } : undefined;
    }
    if (!cell || event.button !== "left") return undefined;
    if (event.type === "click") cell.act();
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
    // pi's `Container` is the tree's node; reached by shape so the plugin need not import it.
    const children = (component as { children?: unknown }).children;
    if (!Array.isArray(children)) return undefined;
    let preceding = 0;
    for (const child of children as Component[]) {
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
  if (align === "nearest" && end <= start) {
    const top = Math.max(end, Math.min(start, scroll.scrollTop));
    if (top !== scroll.scrollTop) scroll.scrollTo(top);
  } else {
    scroll.scrollTo(align === "end" ? Math.max(start, end) : start);
  }
  return true;
}
