/**
 * The /docfix panel: the open queue grouped by doc in one column, each row set to apply, dismiss
 * or skip. A row starts folded, its claim cut at a few lines; opening it shows the claim whole
 * and its evidence under it at the panel's full width. The panel scrolls as a whole and keeps
 * the selected row in view.
 *
 * Closing carries the choices out: the dismissed ones are dismissed here, and the applied ones go
 * to the caller, which drafts the prompt.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  visibleWidth,
  type Component,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import {
  bodyOrigin,
  clamp,
  emptyState,
  modalFrame,
  modalRows,
  notice,
  paint,
  tokens,
  type Hint,
} from "../../../kit/pi/ui.ts";
import {
  byTarget,
  choiceSummary,
  openQueue,
  repeats,
  seen,
  toggleChoice,
  type Choice,
  type Suggestion,
} from "../core/docfix.ts";
import { evidence } from "./evidence.ts";

export type PanelDeps = {
  load(): Promise<Suggestion[]>;
  /** Dismisses what closing the panel carries out. */
  dismiss(picked: Suggestion[]): Promise<void>;
};

export const EMPTY_TEXT = "Nothing to review: no open doc suggestions in this repo.";

const TITLE = "Doc suggestions";
/** From this many sessions a suggestion has been hit often enough to flag. */
const SEEN_WARN = 3;
/** Frame rows around the body: the top and bottom borders, the blank rows under and above. */
const FRAME_ROWS = 4;
/** Lines of a folded row's claim; an open row shows it whole. */
const FOLDED_LINES = 3;
/** The pointer's gutter, before a header; a row is set in twice as far. */
const GUTTER = 2;
/** Lines one wheel notch moves the panel. */
const WHEEL_LINES = 3;
/** Below this content width a doc's keys drop their `all`. */
const NARROW = 60;

const CHOICES = ["apply", "dismiss", "skip"] as const;
type State = Choice | "skip" | "mixed";

const days = (iso: string, now: number) => {
  const n = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return Number.isFinite(n) && n >= 1 ? n : 0;
};
const age = (iso: string, now: number) => {
  const n = days(iso, now);
  if (n < 1) return "today";
  return n < 30 ? `${n}d` : `${Math.floor(n / 30)}mo`;
};

/** A place the selection stops: a doc's header, or a row. */
type Stop = { kind: "doc"; target: string; ids: string[] } | { kind: "row"; s: Suggestion };

/** What a body line is, for the mouse: whose it is, and where its keys sit. */
type Hit = {
  stop: number;
  /** The keys on this line, by their columns in the body. */
  keys?: { from: number; to: number; choice: Choice | undefined }[];
};

type Note = { text: string; status: "success" | "error" };

export class DocsPanel implements Component {
  private items: Suggestion[];
  private set: Record<string, Choice> = {};
  private open = new Set<string>();
  private at = 1;
  private scroll = 0;
  private note: Note | undefined;
  private isClosing = false;
  /** Each body line's owner, as of the last render. */
  private hits: Hit[] = [];
  /** Where the body's first line sits in the panel's cells, and its window. */
  private window = { top: 0, height: 1, max: 0 };

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly deps: PanelDeps,
    initial: Suggestion[],
    private readonly done: (apply: Suggestion[] | undefined) => void,
  ) {
    this.items = openQueue(initial);
  }

  invalidate() {}

  /** Headers and rows in the order drawn. */
  private stops(): Stop[] {
    return byTarget(this.items).flatMap(([target, rows]): Stop[] => [
      { kind: "doc", target, ids: rows.map((s) => s.id) },
      ...rows.map((s): Stop => ({ kind: "row", s })),
    ]);
  }

  private idsOf(stop: Stop | undefined) {
    if (!stop) return [];
    return stop.kind === "doc" ? stop.ids : [stop.s.id];
  }

  private choose(ids: string[], choice: Choice | undefined) {
    if (ids.length === 0) return;
    this.set = toggleChoice(this.set, ids, choice);
    this.note = undefined;
  }

  private toggleOpen(ids: string[]) {
    const isOpen = ids.every((id) => this.open.has(id));
    for (const id of ids) {
      if (isOpen) this.open.delete(id);
      else this.open.add(id);
    }
  }

  private move(by: number) {
    const count = this.stops().length;
    this.at = Math.max(0, Math.min(count - 1, this.at + by));
    this.follow = true;
  }

  /** Set by a move: the next render scrolls the selection into view. */
  private follow = true;

  private scrollBy(lines: number) {
    this.scroll = Math.max(0, Math.min(this.window.max, this.scroll + lines));
    this.follow = false;
  }

  /** Carries the choices out and closes; a dismiss that fails keeps the panel open. */
  private close() {
    if (this.isClosing) return;
    const applied = this.items.filter((s) => this.set[s.id] === "apply");
    const dismissed = this.items.filter((s) => this.set[s.id] === "dismiss");
    if (dismissed.length === 0) return this.done(applied);
    this.isClosing = true;
    void this.deps.dismiss(dismissed).then(
      () => this.done(applied),
      (error) => {
        this.isClosing = false;
        this.note = { text: `Dismiss failed: ${String(error)}`, status: "error" };
        this.tui.requestRender();
      },
    );
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q") return this.close();
    if (this.items.length === 0) return;
    const stop = this.stops()[this.at];
    if (matchesKey(data, Key.up) || data === "k") this.move(-1);
    else if (matchesKey(data, Key.down) || data === "j") this.move(1);
    else if (matchesKey(data, Key.pageDown)) this.scrollBy(this.window.height - 1);
    else if (matchesKey(data, Key.pageUp)) this.scrollBy(-(this.window.height - 1));
    else if (matchesKey(data, Key.enter) || data === " ") this.toggleOpen(this.idsOf(stop));
    else if (data === "a") this.choose(this.idsOf(stop), "apply");
    else if (data === "d") this.choose(this.idsOf(stop), "dismiss");
    else if (data === "s") this.choose(this.idsOf(stop), undefined);
    else if (data === "e") {
      const all = this.items.map((s) => s.id);
      if (all.every((id) => this.open.has(id))) this.open.clear();
      else this.open = new Set(all);
    } else return;
    this.tui.requestRender();
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (this.items.length === 0) return undefined;
    if (event.type === "wheel") {
      this.scrollBy(Math.sign(event.wheelDelta ?? 0) * WHEEL_LINES);
      this.tui.requestRender();
      return { handled: true };
    }
    if (event.type !== "click" || event.button !== "left") return undefined;
    const line = event.y - this.window.top;
    if (line < 0 || line >= this.window.height) return undefined;
    const hit = this.hits[this.scroll + line - (this.scroll > 0 ? 1 : 0)];
    if (!hit) return undefined;
    const x = event.x - bodyOrigin.x;
    const key = hit.keys?.find((k) => x >= k.from && x < k.to);
    const stop = this.stops()[hit.stop];
    this.at = hit.stop;
    this.note = undefined;
    if (key) this.choose(this.idsOf(stop), key.choice);
    else this.toggleOpen(this.idsOf(stop));
    this.tui.requestRender();
    return { handled: true };
  }

  private stateOf(ids: string[]): State {
    const states = new Set(ids.map((id) => this.set[id] ?? "skip"));
    return states.size === 1 ? ([...states][0] ?? "skip") : "mixed";
  }

  /** The apply, dismiss and skip keys, the one set lit; with their columns from `from`. */
  private keys(state: State, from: number, suffix = "") {
    const t = this.theme;
    const parts: string[] = [];
    const keys: NonNullable<Hit["keys"]> = [];
    let col = from;
    for (const [i, choice] of CHOICES.entries()) {
      if (i > 0) {
        parts.push(" ".repeat(tokens.gutter));
        col += tokens.gutter;
      }
      const label = choice + suffix;
      parts.push(state === choice ? t.bold(paint(t, "text", label)) : paint(t, "dim", label));
      keys.push({
        from: col,
        to: col + visibleWidth(label),
        choice: choice === "skip" ? undefined : choice,
      });
      col += visibleWidth(label);
    }
    return { text: parts.join(""), width: col - from, keys };
  }

  /** A doc's header: the pointer's gutter, its path, a rule, and the keys that set every row. */
  private header(stop: Extract<Stop, { kind: "doc" }>, n: number, width: number, isAt: boolean) {
    const t = this.theme;
    const room = width - GUTTER;
    const suffix = room < NARROW ? "" : " all";
    const probe = this.keys("mixed", 0, suffix);
    const path = clamp(stop.target, room);
    const last = path.at(-1) ?? "";
    const rule = room - visibleWidth(last) - probe.width - 2;
    const pointer = (i: number) =>
      i === 0 && isAt ? paint(t, "accent", tokens.glyph.pointer) + " " : " ".repeat(GUTTER);
    const title = (s: string) => t.bold(paint(t, isAt ? "accent" : "text", s));
    const lines: string[] = [];
    const hits: Hit[] = [];
    path.slice(0, -1).forEach((l, i) => {
      lines.push(pointer(i) + title(l));
      hits.push({ stop: n });
    });
    const tail = rule > 0 ? " " + paint(t, "dim", tokens.glyph.rule.repeat(rule)) + " " : null;
    if (tail) {
      const from = GUTTER + visibleWidth(last) + rule + 2;
      const k = this.keys(this.stateOf(stop.ids), from, suffix);
      lines.push(pointer(path.length - 1) + title(last) + tail + k.text);
      hits.push({ stop: n, keys: k.keys });
    } else {
      // A path that leaves no room for the keys gets them on a line of their own.
      lines.push(pointer(path.length - 1) + title(last));
      hits.push({ stop: n });
      const k = this.keys(this.stateOf(stop.ids), room - probe.width + GUTTER, suffix);
      lines.push(" ".repeat(room - probe.width + GUTTER) + k.text);
      hits.push({ stop: n, keys: k.keys });
    }
    return { lines, hits };
  }

  /** A row: its claim, cut while folded and coloured by its state; its meta and keys; its evidence. */
  private row(s: Suggestion, n: number, width: number, now: number, isAt: boolean) {
    const t = this.theme;
    const indent = 2 * GUTTER;
    const room = width - indent;
    const state = this.set[s.id];
    const isOpen = this.open.has(s.id);
    const claim = clamp(s.claim, room, isOpen ? {} : { max: FOLDED_LINES });
    const style = (l: string) =>
      state === "dismiss"
        ? t.strikethrough(paint(t, "dim", l))
        : t.bold(paint(t, state === "apply" ? "success" : isAt ? "accent" : "text", l));
    const lines = claim.map(
      (l, i) =>
        (i === 0 && isAt
          ? " ".repeat(GUTTER) + paint(t, "accent", tokens.glyph.pointer) + " "
          : " ".repeat(indent)) + style(l),
    );
    const hits: Hit[] = claim.map(() => ({ stop: n }));
    const count = seen(s);
    const meta = [
      paint(t, s.kind === "wrong" ? "error" : "dim", `${tokens.glyph.kind[s.kind]} ${s.kind}`),
      ...(count > 1 ? [paint(t, count >= SEEN_WARN ? "warning" : "dim", repeats(s))] : []),
      paint(t, "dim", age(s.updated, now)),
      paint(
        t,
        "dim",
        `${isOpen ? "▾" : "▸"} evidence${s.evidence.length > 1 ? ` ${s.evidence.length}` : ""}`,
      ),
    ].join("  ");
    const probe = this.keys("skip", 0);
    const gap = room - visibleWidth(meta) - probe.width;
    if (gap >= tokens.gutter) {
      const k = this.keys(state ?? "skip", indent + visibleWidth(meta) + gap);
      lines.push(" ".repeat(indent) + meta + " ".repeat(gap) + k.text);
      hits.push({ stop: n, keys: k.keys });
    } else {
      // Too narrow for both on one line: the keys go under the meta, at the right.
      const k = this.keys(state ?? "skip", width - probe.width);
      lines.push(" ".repeat(indent) + meta, " ".repeat(width - probe.width) + k.text);
      hits.push({ stop: n }, { stop: n, keys: k.keys });
    }
    if (isOpen) {
      const body = [
        "",
        ...(s.evidence.length > 0
          ? evidence(t, Math.max(1, room - GUTTER), s.evidence)
          : [paint(t, "dim", "none filed")]),
      ].map((l) => (l ? " ".repeat(indent + GUTTER) + l : l));
      lines.push(...body);
      hits.push(...body.map(() => ({ stop: n })));
    }
    return { lines, hits };
  }

  private hints(): Hint[] {
    return [
      { key: "↑↓", label: "move" },
      { key: "a", label: "apply" },
      { key: "d", label: "dismiss" },
      { key: "s", label: "skip" },
      { key: "⏎", label: "evidence" },
      ...(this.window.max > 0 ? [{ key: "pgup/pgdn", label: "scroll" }] : []),
      { key: "e", label: "all" },
      { key: "esc", label: "close", essential: true },
    ];
  }

  render(width: number): string[] {
    const t = this.theme;
    const content = width - 2 - 2 * tokens.padding;
    const rows = modalRows(this.tui.terminal.rows) - FRAME_ROWS;
    const now = Date.now();
    const message = this.note ? notice(t, content, this.note.text, this.note.status) : undefined;

    if (this.items.length === 0) {
      this.hits = [];
      this.window = { top: 0, height: 0, max: 0 };
      return modalFrame(t, {
        width,
        title: TITLE,
        body: emptyState(t, content, EMPTY_TEXT),
        hints: [{ key: "esc", label: "close", essential: true }],
        notice: message,
      });
    }

    const summary = choiceSummary(this.items.map((s) => this.set[s.id]));
    const head = [
      summary
        ? paint(t, "text", `On close: ${summary}`)
        : paint(t, "dim", "Closing carries out apply and dismiss"),
      "",
    ];

    const stops = this.stops();
    this.at = Math.max(0, Math.min(stops.length - 1, this.at));
    const lines: string[] = [];
    const hits: Hit[] = [];
    const span = new Map<number, [number, number]>();
    stops.forEach((stop, n) => {
      const isAt = n === this.at;
      const drawn =
        stop.kind === "doc"
          ? this.header(stop, n, content, isAt)
          : this.row(stop.s, n, content, now, isAt);
      // A blank row before every doc but the first and under every header; between rows too.
      if (lines.length > 0) {
        lines.push("");
        hits.push({ stop: n });
      }
      const start = lines.length;
      lines.push(...drawn.lines);
      hits.push(...drawn.hits);
      span.set(n, [start, lines.length]);
    });
    this.hits = hits;

    // The window: as tall as the content up to the room, the selection kept in view.
    const height = Math.max(1, Math.min(rows - head.length, lines.length));
    const max = Math.max(0, lines.length - height);
    const [from, to] = span.get(this.at) ?? [0, 0];
    if (this.follow) {
      // The selection in view, with its doc's header when it is the doc's first row; an open
      // row's evidence is scrolled to by hand.
      const before = stops[this.at - 1];
      const top = before?.kind === "doc" ? (span.get(this.at - 1)?.[0] ?? from) : from;
      // A window that scrolls gives a row at each end to `↑ n more` and `↓ n more`.
      const room = Math.max(1, height - 2);
      const end = Math.min(to, top + room);
      if (top < this.scroll) this.scroll = top;
      else if (end > this.scroll + room) this.scroll = end - room;
    }
    this.scroll = Math.max(0, Math.min(max, this.scroll));
    this.window = { top: bodyOrigin.y + head.length, height, max };
    const shown = this.windowed(lines, height);

    return modalFrame(t, {
      width,
      title: TITLE,
      count: this.items.length,
      body: [...head, ...shown],
      hints: this.hints(),
      notice: message,
    });
  }

  /**
   * `lines` in `height` rows: whole when they fit, else the window at `scroll` with a dim
   * `↑ n more` / `↓ n more` row standing in for what is above and below.
   */
  private windowed(lines: string[], height: number): string[] {
    const t = this.theme;
    if (lines.length <= height) return lines;
    const top = this.scroll > 0 ? 1 : 0;
    let room = height - top;
    if (this.scroll + room < lines.length) room -= 1;
    const end = this.scroll + room;
    const more = (glyph: string, n: number) => paint(t, "dim", `${glyph} ${n} more`);
    return [
      ...(top ? [more(tokens.glyph.more.up, this.scroll)] : []),
      ...lines.slice(this.scroll, end),
      ...(end < lines.length ? [more(tokens.glyph.more.down, lines.length - end)] : []),
    ];
  }
}
