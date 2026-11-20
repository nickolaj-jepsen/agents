import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Container,
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
  bodyOrigin,
  chipRow,
  clamp,
  modalFrame,
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

type Row = BandRow<RoundAction>;
type Item = NonNullable<View["item"]>;

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

  constructor(
    private readonly theme: Theme,
    private readonly read: () => { round: Round; active: boolean } | undefined,
    private readonly onAction: (action: RoundAction) => void,
  ) {}

  invalidate(): void {}

  span(step: number): [number, number] | undefined {
    const start = this.stops[step];
    const end = this.ends[step];
    return start === undefined || end === undefined ? undefined : [start, end];
  }

  render(columns: number): string[] {
    this.hits.clear();
    this.stops = [];
    this.ends = [];
    const state = this.read();
    if (!state || columns < 20) return [];
    const { round, active } = state;
    const { theme } = this;
    const width = widthCap("reading", columns - 2);
    const inner = width - 2 * bodyOrigin.x;
    const out: string[] = [];
    const dim = (text: string) => paint(theme, "dim", text);
    const accent = (text: string) => paint(theme, "accent", text);
    const asRows = (lines: string[], act?: RoundAction): Row[] =>
      lines.map((text) => ({ text, act }));
    const card = (step: number, title: string, rows: Row[], action?: RoundAction) => {
      if (out.length) out.push("");
      this.stops[step] = out.length;
      if (action) this.hits.set(out.length, { text: ` ${title}`, act: action });
      rows.forEach((row, i) => {
        if (row.act) this.hits.set(out.length + bodyOrigin.y + i, row);
      });
      const frame = modalFrame(theme, { width, title, body: rows.map((r) => r.text), hints: [] });
      out.push(...frame.map((line) => ` ${line}`));
      this.ends[step] = out.length;
    };

    const current = view(round.form, round.draft);
    for (let step = 0; step < current.count; step++) {
      const item = view(round.form, { ...round.draft, step }).item;
      if (!item) continue;
      const here = active && current.step === step;
      const rows: Row[] = asRows(prose(theme, inner, item.title));
      if (item.body) {
        rows.push({ text: "" });
        // The original assistant message stays above the cards, with all its Markdown intact.
        const detail = new Markdown(item.body, 0, 0, getMarkdownTheme()).render(inner);
        rows.push(...asRows(detail.slice(0, 3)));
        if (detail.length > 3) rows.push({ text: dim("… full context in the message above") });
      }
      rows.push({ text: "" });
      const letters = choiceLetters(item);
      item.entries.forEach((entry, index) => {
        if (!active && entry.kind === "write" && !entry.isChosen) return;
        const key = letters[index];
        const marker = entry.isChosen ? tokens.glyph.single.on : tokens.glyph.single.off;
        const prefix = `${marker} ${key ? `${key}. ` : ""}`;
        const pad = " ".repeat(visibleWidth(prefix));
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
                (i ? pad : entry.isChosen ? accent(prefix) : dim(prefix)) +
                (entry.isChosen ? accent(line) : line),
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
      if (active || item.note) rows.push({ text: "" });
      if (active && item.accepts.includes(","))
        rows.push({ text: `Take ${item.accepts}`, act: { kind: "accept", step } });
      if (current.review[step]?.isAnswered && active)
        rows.push({ text: "Clear answer", act: { kind: "clear", step } });
      if (item.note) rows.push(...asRows(note(theme, inner, item.note)));
      if (active)
        rows.push({ text: item.note ? "Edit note" : "Add a note", act: { kind: "note", step } });
      card(step, `${here ? "❯ " : ""}${item.label}/${current.count}`, rows);
    }

    // The review is a single stop until opened. Older rounds retain their full summary.
    const title = `Review answers  ${current.answered}/${current.count}`;
    if (active && !current.isReview) {
      card(current.count, `+ ${title}`, [], { kind: "review" });
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
            (line, i) => (i ? pad : accent(prefix)) + line,
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
      review.push({
        text: current.note ? "Edit round note" : "Add a round note",
        act: { kind: "note", step: current.count },
      });
      if (current.reply) {
        review.push({ text: accent("Fill prompt"), act: { kind: "fill" } });
        review.push({ text: accent("Send reply"), act: { kind: "send" } });
      }
    }
    const marker = round.sent ? "  Sent" : "";
    card(
      current.count,
      `${active ? "❯ " : ""}${title}${marker}`,
      review,
      active ? { kind: "review" } : undefined,
    );
    return out;
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const row = this.hits.get(event.y);
    if (!row?.act || event.button !== "left") return undefined;
    const x = event.x - bodyOrigin.x - 1;
    if (x < 0 || x >= visibleWidth(row.text.trimEnd())) return undefined;
    if (event.type === "click") this.onAction(row.act);
    return event.type === "press" || event.type === "click" ? { handled: true } : undefined;
  }
}

/** The prompt normally owns the keyboard. Alt+a hands it to the guide until Esc or a prompt click. */
export class AnswerGuide implements Component, Focusable {
  private hits = new Map<number, Row>();
  private isFocused = false;
  private size: string | undefined;

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
    this.tui.requestRender();
  }

  invalidate(): void {}

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
    const label = v.isReview ? "Review" : (v.item?.label ?? v.title);
    if (columns < 20) return [];
    const size = `${columns}x${this.tui.terminal.rows}`;
    if (this.size && size !== this.size) queueMicrotask(this.onResize);
    this.size = size;
    const head =
      clamp(`${label}  ${v.answered}/${v.count} answered`, columns - 1, { max: 1 })[0] ?? "";
    if (!this.focused) {
      const row = chipRow<RoundAction>(this.theme, [
        { key: "alt+a", label: "answer", act: { kind: "focus" } },
      ]);
      this.hits.set(1, row);
      return [dim(` ${head}`), ` ${row.text}  ${dim("/answer")}`];
    }
    const hints = [
      "esc prompt",
      "j/k move",
      "r review",
      "n note",
      ...(v.item
        ? [
            `${choiceLetters(v.item).join("/").toLowerCase()} choose`,
            ...(v.review[v.step]?.isAnswered ? ["x clear"] : []),
            ...(v.item.accepts.includes(",") ? ["y take recommendation"] : []),
          ]
        : v.reply
          ? ["enter fill", "s send"]
          : []),
    ];
    // Wrap whole hints rather than cutting a key off the narrow guide.
    const lines: string[] = [];
    for (const hint of hints) {
      const previous = lines.at(-1);
      if (previous && visibleWidth(previous + "  " + hint) < columns)
        lines[lines.length - 1] += `  ${hint}`;
      else lines.push(hint);
    }
    return [
      paint(this.theme, "accent", ` ${head}`),
      ...lines.flatMap((line) => clamp(` ${line}`, columns).map(dim)),
    ];
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
export function reveal(tui: TUI, card: Transcript, step: number, align: "start" | "end"): boolean {
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
  const row = align === "end" ? Math.max(span[0], span[1] - scroll.viewportHeight) : span[0];
  scroll.scrollTo(offset + row);
  return true;
}
