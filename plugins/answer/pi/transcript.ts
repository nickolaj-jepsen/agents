import {
  getMarkdownTheme,
  getSelectListTheme,
  rawKeyHint,
  type Theme,
} from "@earendil-works/pi-coding-agent";
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
  clamp,
  gutterLine,
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
  | { kind: "fill" | "send" | "review" | "release" | "focus" };

type Row = BandRow<RoundAction> & { editorWidth?: number };
type Field = { kind: "write" | "note"; step: number; editor: Editor };
type Item = NonNullable<View["item"]>;

// Separate the active stop from answered stops, using Pi's focus and ordinary border colors.
const questionTone = (theme: Theme, active: boolean, answered: boolean, text: string) =>
  theme.fg(active ? "borderAccent" : answered ? "border" : "text", text);

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
  private input?: { field: Field; first: number; x: number; width: number; height: number };

  constructor(
    private readonly theme: Theme,
    private readonly read: () => { round: Round; active: boolean; field?: Field } | undefined,
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
    const indent = " ".repeat(tokens.gutter);
    const inner = Math.min(width - tokens.gutter, tokens.prose);
    const out: string[] = [];
    const dim = (text: string) => paint(theme, "dim", text);
    const accent = (text: string) => paint(theme, "accent", text);
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
      const rail = state
        ? questionTone(theme, state.here, state.answered, tokens.border.v)
        : dim(tokens.border.v);
      const append = (row: Row) => {
        const text = gutterLine(rail, row.text);
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
        } else if (row.act) this.hits.set(out.length, { ...row, text });
        out.push(text);
      };
      heading.forEach(append);
      if (body.length) append({ text: "" });
      body.forEach(append);
      this.ends[step] = out.length;
    };
    const reviewHeading = (title: string, pointer: string, action?: RoundAction) =>
      asRows(
        clamp(`${pointer} ${title}`, inner).map((line) => theme.bold(line)),
        action,
      );

    const current = view(round.form, round.draft);
    for (let step = 0; step < current.count; step++) {
      const item = view(round.form, { ...round.draft, step }).item;
      if (!item) continue;
      const here = active && current.step === step;
      const answered = current.review[step]?.isAnswered ?? false;
      const tone = (text: string) => questionTone(theme, here, answered, text);
      const prefix = `${here ? tokens.glyph.pointer : " "} ${item.label}${indent}`;
      const title = `${item.title}${answered ? ` ${tokens.glyph.done}` : ""}`;
      const heading = asRows(
        clamp(title, inner - visibleWidth(prefix)).map((line, i) =>
          theme.bold(tone((i ? " ".repeat(visibleWidth(prefix)) : prefix) + line)),
        ),
      );
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
        const marker = entry.isChosen ? tokens.glyph.single.on : tokens.glyph.single.off;
        const prefix = `${key || " "} ${marker} `;
        const editing =
          entry.kind === "write" ? editRows(step, "write", `${key || " "} › `) : undefined;
        if (editing) {
          rows.push(...editing);
          return;
        }
        const pad = " ".repeat(visibleWidth(prefix));
        const ink = (text: string) =>
          entry.isChosen && entry.kind !== "write" ? theme.bold(tone(text)) : tone(text);
        const text =
          entry.kind === "write" && item.written
            ? item.written
            : entry.key && entry.text.startsWith(`${entry.key}. `)
              ? entry.text.slice(entry.key.length + 2)
              : entry.text;
        const action: RoundAction | undefined = active
          ? { kind: "pick", step, entry: index }
          : undefined;
        const lines = clamp(text, inner - visibleWidth(prefix));
        rows.push(
          ...asRows(
            lines.map(
              (line, i) =>
                (i
                  ? pad
                  : (here || entry.isChosen ? ink(key || " ") : dim(key || " ")) +
                    ` ${entry.isChosen && entry.kind !== "write" ? ink(marker) : dim(marker)} `) +
                (entry.isChosen ? ink(line) : entry.kind === "write" ? dim(line) : line),
            ),
            action,
          ),
        );
        if (entry.detail)
          rows.push(
            ...asRows(
              prose(theme, inner - pad.length, entry.detail, { max: 3 }, "dim").map(
                (line) => pad + line,
              ),
              action,
            ),
          );
      });
      if (item.recommended)
        rows.push(
          { text: "" },
          ...asRows(prose(theme, inner, `Recommended: ${item.recommended}`, { max: 3 }, "dim")),
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
        const label = "Note: ";
        rows.push(
          { text: "" },
          ...(editRows(step, "note", label) ??
            asRows(
              clamp(item.note || "Add a note", inner - visibleWidth(label)).map(
                (line, i) =>
                  (i ? " ".repeat(visibleWidth(label)) : dim(label)) +
                  (item.note ? tone(line) : dim(line)),
              ),
              active ? { kind: "note", step } : undefined,
            )),
        );
      }
      section(step, heading, rows, { here, answered });
    }

    // The review is a single stop until opened. Older rounds retain their full summary.
    const title = `Review answers  ${current.answered}/${current.count}`;
    if (active && !current.isReview) {
      section(current.count, reviewHeading(title, "+", { kind: "review" }), []);
      return out;
    }
    const review: Row[] = [];
    const labelWidth = Math.max(...current.review.map((row) => visibleWidth(row.label)));
    for (const [step, row] of current.review.entries()) {
      const action: RoundAction | undefined = active ? { kind: "go", step } : undefined;
      const prefix = row.label + " ".repeat(labelWidth - visibleWidth(row.label) + 2);
      const pad = " ".repeat(visibleWidth(prefix));
      review.push(
        ...asRows(
          clamp(row.title, inner - pad.length, { max: 3 }).map(
            (line, i) => (i ? pad : dim(prefix)) + line,
          ),
          action,
        ),
      );
      const answer = row.isAnswered ? row.shown : "Unanswered";
      review.push(
        ...asRows(
          prose(theme, inner - pad.length, answer, { max: 3 }, row.isAnswered ? "text" : "dim").map(
            (line) => pad + line,
          ),
          action,
        ),
      );
      if (row.note) review.push(...asRows(note(theme, inner, row.note)));
      review.push({ text: "" });
    }
    if (current.note) review.push(...asRows(note(theme, inner, current.note)), { text: "" });
    if (active) {
      review.push(
        ...(editRows(current.count, "note", "Round note: ") ?? [
          {
            text: dim(current.note ? "Edit round note" : "Add a round note"),
            act: { kind: "note", step: current.count } as const,
          },
        ]),
      );
      if (current.reply) {
        review.push({ text: accent("Fill prompt"), act: { kind: "fill" } });
        review.push({ text: accent("Send reply"), act: { kind: "send" } });
      }
    }
    const marker = round.sent ? "  Sent" : "";
    section(
      current.count,
      reviewHeading(
        `${title}${marker}`,
        active ? tokens.glyph.pointer : " ",
        active ? { kind: "review" } : undefined,
      ),
      review,
    );
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
    const row = this.hits.get(event.y);
    if (!row?.act || event.button !== "left") return undefined;
    if (event.x < 1 + tokens.gutter || event.x >= visibleWidth(row.text.trimEnd()))
      return undefined;
    if (event.type === "click") this.onAction(row.act);
    return event.type === "press" || event.type === "click" ? { handled: true } : undefined;
  }
}

/** The prompt normally owns the keyboard. Alt+a hands it to the guide until Esc or a prompt click. */
export class AnswerGuide implements Component, Focusable {
  private hits = new Map<number, Row>();
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
    if (data === "j") return { kind: "go", step: (v.step + 1) % (v.count + 1) };
    if (data === "k") return { kind: "go", step: (v.step + v.count) % (v.count + 1) };
    if (v.isReview && v.reply && matchesKey(data, "enter")) return { kind: "fill" };
    if (v.isReview && v.reply && data === "s") return { kind: "send" };
    if (v.item && v.review[v.step]?.isAnswered && data === "x")
      return { kind: "clear", step: v.step };
    if (v.item?.accepts.includes(",") && data === "y") return { kind: "accept", step: v.step };
    if (!v.item || !/^[a-z]$/i.test(data)) return undefined;
    const item = v.item;
    const entry = choiceLetters(item).indexOf(data.toUpperCase());
    return entry < 0 ? undefined : { kind: "pick", step: v.step, entry };
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
      if (!this.focused) return this.offer("resume editing", "");
      return clamp(
        ` ${[
          rawKeyHint("enter", "save"),
          rawKeyHint("shift+enter", "newline"),
          rawKeyHint("esc", "cancel"),
        ].join(gap)}`,
        columns,
      );
    }
    const progress = dim(`${label}  ${v.answered}/${v.count} answered`);
    if (!this.focused)
      return clamp(this.offer("answer", `${gap}${progress}`)[0]!, columns, { max: 1 });
    const keyHint = (key: string, description: string) =>
      questionTone(this.theme, false, true, key) + dim(` ${description}`);
    const hints = [keyHint("jk", "move")];
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
          keyHint(
            picks.length > 1 && consecutive ? `${picks[0]}–${picks.at(-1)}` : picks.join("/"),
            "pick",
          ),
        );
      if (write) hints.push(keyHint(write, "write"));
    } else if (v.reply) {
      hints.push(keyHint("enter", "fill"), keyHint("s", "send"));
    }
    hints.push(keyHint("n", "note"), keyHint("r", "review"), keyHint("esc", "prompt"));
    if (v.item && v.review[v.step]?.isAnswered) hints.push(keyHint("x", "clear"));
    if (v.item?.accepts.includes(",")) hints.push(keyHint("y", "take recommendation"));
    const digits = String(v.count).length;
    const stop = v.isReview ? "Review" : `${String(v.step + 1).padStart(digits, "0")}/${v.count}`;
    const badge = questionTone(this.theme, true, false, this.theme.inverse(` ${stop} `));
    const lines = [badge];
    for (const hint of hints) {
      const previous = lines.at(-1)!;
      if (visibleWidth(previous + gap + hint) <= columns) lines[lines.length - 1] += gap + hint;
      else lines.push(` ${hint}`);
    }
    return lines.map((line) => clamp(line, columns, { max: 1 })[0] ?? "");
  }

  private offer(label: string, suffix: string): [string] {
    const shortcut = rawKeyHint("alt+a", label);
    this.hits.set(0, {
      text: shortcut,
      cells: [{ start: 0, end: visibleWidth(shortcut), act: { kind: "focus" } }],
    });
    return [` ${shortcut}${suffix}`];
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const action = bandAct({ hits: this.hits }, event.x, event.y);
    if (!action || event.button !== "left") return undefined;
    if (event.type === "click") this.onAction(action);
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
  if (align === "nearest" && end <= start) {
    const top = Math.max(end, Math.min(start, scroll.scrollTop));
    if (top !== scroll.scrollTop) scroll.scrollTo(top);
  } else {
    scroll.scrollTo(align === "end" ? Math.max(start, end) : start);
  }
  return true;
}
