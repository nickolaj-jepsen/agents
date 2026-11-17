/**
 * The /docfix panel: the open queue grouped by doc, the selected suggestion in full beside
 * it, and the answers a person gives one. Nothing is cut: a claim wraps to as many lines as it
 * needs, and a detail taller than its pane scrolls (PgUp/PgDn, or the wheel over it). Dismiss
 * happens in place and can be undone; apply closes the panel and the caller drafts the prompt.
 * Built on the pi kit (`../../../kit/pi`).
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  type Component,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import {
  bodyOrigin,
  emptyState,
  clamp,
  List,
  modalFrame,
  modalRows,
  entries,
  notice,
  paint,
  prose,
  section,
  splitFrame,
  splitLayout,
  tokens,
  type Hint,
} from "../../../kit/pi/ui.ts";
import { openQueue, seen, type Kind, type Suggestion } from "../core/docfix.ts";

export type PanelDeps = {
  load(): Promise<Suggestion[]>;
  dismiss(picked: Suggestion[]): Promise<void>;
  /** Opens dismissed suggestions again: what `u` does after a dismiss. */
  restore(picked: Suggestion[]): Promise<void>;
};

export const EMPTY_TEXT = "Nothing to review: no open doc suggestions in this repo.";

const TITLE = "Doc suggestions";
/** From this many sessions a suggestion has been hit often enough to flag. */
const SEEN_WARN = 3;
/** Frame rows around the body: the top and bottom borders, the blank rows under and above. */
const FRAME_ROWS = 4;
/** Cells before a stacked row's title, and its metadata columns less: a title's width, roughly. */
const LIST_PREFIX = 4 + 16;
/** A claim of more lines than this at the list's width is also given to the stacked detail. */
const LONG_CLAIM = 4;
/** Lines one wheel notch over the detail moves it. */
const WHEEL_LINES = 3;

const days = (iso: string, now: number) => {
  const n = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return Number.isFinite(n) && n >= 1 ? n : 0;
};
const ageShort = (iso: string, now: number) => {
  const n = days(iso, now);
  if (n < 1) return "today";
  return n < 30 ? `${n}d` : `${Math.floor(n / 30)}mo`;
};
const ageLong = (iso: string, now: number) => {
  const n = days(iso, now);
  return n < 1 ? "today" : n === 1 ? "1 day ago" : `${n} days ago`;
};

const KIND_ICON: Record<Kind, string> = tokens.glyph.kind;

type Note = { text: string; status: "success" | "error" };

export class DocsPanel implements Component {
  private readonly list = new List<Suggestion>({
    id: (s) => s.id,
    group: (s) => s.target,
    title: (s) => s.claim,
    // No `max`: a claim is shown whole.
    titleLines: { min: 1 },
    marks: "multi",
    columns: [
      {
        width: 1,
        priority: 3,
        text: (s) => KIND_ICON[s.kind],
        role: (s) => (s.kind === "wrong" ? "error" : "text"),
      },
      {
        width: 4,
        priority: 2,
        text: (s) => `${seen(s)}${tokens.glyph.times}`,
        role: (s) => (seen(s) >= SEEN_WARN ? "warning" : undefined),
      },
      { width: 5, priority: 1, text: (s) => ageShort(s.updated, Date.now()) },
    ],
  });
  private note: Note | undefined;
  /** What the last dismiss closed, while `u` can still open it again. */
  private undo: Suggestion[] = [];
  private detailCache = new Map<string, string[]>();
  /** Where the list's first row sits in the panel's cells, as of the last render. */
  private listAt = { x: 0, y: 0 };
  /** Where the detail starts in the panel's cells, as of the last render. */
  private detailAt = { x: 0, y: 0 };
  /** The detail's first visible line; it is whole above this many lines. */
  private scroll = 0;
  /** How far the detail can scroll and how many rows a page is, as of the last render. */
  private reach = { max: 0, page: 1 };
  private lastId: string | undefined;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly deps: PanelDeps,
    initial: Suggestion[],
    private readonly done: (apply: Suggestion[] | undefined) => void,
  ) {
    this.list.setItems(openQueue(initial));
  }

  private async reload() {
    this.list.setItems(openQueue(await this.deps.load()));
    this.detailCache.clear();
    this.tui.requestRender();
  }

  /** Nothing is cached across themes: the cache of a detail is dropped with the theme's. */
  invalidate() {
    this.detailCache.clear();
  }

  private say(text: string, status: Note["status"] = "success") {
    this.note = { text, status };
  }

  private scrollBy(lines: number) {
    this.scroll = Math.max(0, Math.min(this.reach.max, this.scroll + lines));
  }

  private dismiss() {
    const picked = this.list.picked();
    void this.deps.dismiss(picked).then(
      () => {
        this.undo = picked;
        this.say(`Dismissed ${picked.length}: it is not filed again`);
        return this.reload();
      },
      (error) => {
        this.say(`Dismiss failed: ${String(error)}`, "error");
        this.tui.requestRender();
      },
    );
  }

  private restore() {
    const back = this.undo;
    this.undo = [];
    void this.deps.restore(back).then(
      () => {
        this.say(`Restored ${back.length}`);
        return this.reload();
      },
      (error) => {
        this.say(`Restore failed: ${String(error)}`, "error");
        this.tui.requestRender();
      },
    );
  }

  /** Marks every row, or clears the marks when all are on. */
  private markAll() {
    const { list } = this;
    const every = list.items.every((s) => list.marked.has(s.id));
    if (every) list.marked.clear();
    else for (const s of list.items) list.marked.add(s.id);
  }

  handleInput(data: string): void {
    this.note = undefined;
    if (matchesKey(data, Key.escape) || data === "q") return this.done(undefined);
    const list = this.list;
    if (list.items.length === 0) return;
    if (matchesKey(data, Key.up) || data === "k") list.move(-1);
    else if (matchesKey(data, Key.down) || data === "j") list.move(1);
    else if (matchesKey(data, Key.pageDown)) this.scrollBy(this.reach.page);
    else if (matchesKey(data, Key.pageUp)) this.scrollBy(-this.reach.page);
    else if (data === " " || data === "x") list.toggle();
    else if (data === "m") this.markAll();
    else if (data === "a" || matchesKey(data, Key.enter)) return this.done(list.picked());
    else if (data === "d") this.dismiss();
    else if (data === "u" && this.undo.length > 0) this.restore();
    else return;
    this.tui.requestRender();
  }

  /** Whether a point of the last render, in the panel's cells, is over the detail. */
  private isOverDetail(x: number, y: number) {
    return x >= this.detailAt.x && y >= this.detailAt.y;
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (this.list.items.length === 0) return undefined;
    if (event.type === "wheel") {
      const step = Math.sign(event.wheelDelta ?? 0);
      if (this.isOverDetail(event.x, event.y)) this.scrollBy(step * WHEEL_LINES);
      else this.list.move(step);
      return { handled: true };
    }
    const local = { ...event, x: event.x - this.listAt.x, y: event.y - this.listAt.y };
    const result = this.list.mouse(local);
    if (result?.handled && event.type === "click") {
      this.note = undefined;
      // A second click on a row marks it, as space does, so the mouse reaches every action.
      if (event.button === "left" && (event.clickCount ?? 1) >= 2) this.list.toggle();
    }
    return result;
  }

  /**
   * The suggestion in full: the claim when the list does not already show it whole, what it
   * is, and every piece of evidence, newest first, under a header rule.
   */
  private detail(s: Suggestion, width: number, now: number, withClaim: boolean): string[] {
    const key = `${width}:${withClaim}:${s.id}:${s.updated}`;
    const cached = this.detailCache.get(key);
    if (cached) return cached;
    const t = this.theme;
    const count = seen(s);
    const meta = [
      paint(t, s.kind === "wrong" ? "error" : "text", KIND_ICON[s.kind]) +
        " " +
        paint(t, "dim", s.kind),
      paint(t, count >= SEEN_WARN ? "warning" : "dim", `seen ${count}${tokens.glyph.times}`),
      paint(t, "dim", ageLong(s.updated, now)),
    ].join("   ");
    const lines = [
      ...(withClaim ? [...prose(t, width, s.claim), ""] : []),
      meta,
      "",
      section(t, width, "Evidence"),
      ...(s.evidence.length > 0
        ? entries(
            t,
            width,
            [...s.evidence].reverse().map((e) => ({ date: e.at.slice(0, 10), text: e.text })),
          )
        : [paint(t, "dim", "none filed")]),
    ];
    this.detailCache.set(key, lines);
    return lines;
  }

  /**
   * `lines` in a pane `height` rows tall: whole when they fit, else the window at `scroll`
   * with a dim `↑ n more` / `↓ n more` row standing in for what is above and below.
   */
  private windowed(lines: string[], height: number): string[] {
    const t = this.theme;
    if (lines.length <= height) {
      this.scroll = 0;
      this.reach = { max: 0, page: Math.max(1, height - 1) };
      return lines;
    }
    // At the end the top marker alone takes a row; the window never scrolls past that.
    const max = Math.max(0, lines.length - (height - 1));
    this.scroll = Math.min(this.scroll, max);
    this.reach = { max, page: Math.max(1, height - 2) };
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

  private hints(): Hint[] {
    return [
      { key: "↑↓", label: "move" },
      { key: "space", label: "mark" },
      { key: "a", label: "apply" },
      { key: "d", label: "dismiss" },
      ...(this.undo.length > 0 ? [{ key: "u", label: "undo" }] : []),
      ...(this.reach.max > 0 ? [{ key: "pgup/pgdn", label: "scroll" }] : []),
      { key: "m", label: "mark all" },
      { key: "esc", label: "later", essential: true },
    ];
  }

  render(width: number): string[] {
    const t = this.theme;
    const list = this.list;
    const content = width - 2 - 2 * tokens.padding;
    const rows = modalRows(this.tui.terminal.rows) - FRAME_ROWS;
    const now = Date.now();
    const message = this.note ? notice(t, content, this.note.text, this.note.status) : undefined;

    if (list.items.length === 0) {
      this.listAt = { x: 0, y: 0 };
      this.detailAt = { x: width, y: 0 };
      this.reach = { max: 0, page: 1 };
      return modalFrame(t, {
        width,
        title: TITLE,
        body: emptyState(t, content, EMPTY_TEXT),
        hints: [
          ...(this.undo.length > 0 ? [{ key: "u", label: "undo" }] : []),
          { key: "esc", label: "close", essential: true },
        ],
        notice: message,
      });
    }

    const layout = splitLayout(width, this.tui.terminal.columns);
    const current = list.current;
    // A new row starts at the top of its detail.
    if (current?.id !== this.lastId) {
      this.scroll = 0;
      this.lastId = current?.id;
    }
    // The tallest detail sets the height, so the panel stays put as the cursor moves.
    const tallest = (w: number, withClaim: (s: Suggestion) => boolean) =>
      list.items.reduce((n, s) => Math.max(n, this.detail(s, w, now, withClaim(s)).length), 0);

    if (layout.stacked) {
      // The claim is in the list above, whole, so the detail starts at the meta line: unless it
      // is too long for the list's few rows, when the detail carries it, scrolling.
      const share = Math.max(9, Math.floor((rows - 1) * 0.45));
      const isLong = (s: Suggestion) => clamp(s.claim, content - LIST_PREFIX).length > LONG_CLAIM;
      const d = Math.min(share, tallest(content, isLong));
      const shown = list.render(
        t,
        content,
        Math.min(list.naturalRows(t, content), Math.max(1, rows - 1 - d)),
      );
      const detail = current
        ? this.windowed(this.detail(current, content, now, isLong(current)), d)
        : [];
      while (detail.length < d) detail.push("");
      this.listAt = bodyOrigin;
      this.detailAt = { x: 0, y: bodyOrigin.y + shown.length + 1 };
      return modalFrame(t, {
        width,
        title: TITLE,
        count: list.items.length,
        body: [...shown, "", ...detail],
        hints: this.hints(),
        notice: message,
      });
    }

    const height = Math.max(
      1,
      Math.min(
        rows,
        Math.max(
          list.naturalRows(t, layout.left),
          tallest(layout.right, () => true),
        ),
      ),
    );
    const left = list.render(t, layout.left, height);
    const right = current
      ? this.windowed(this.detail(current, layout.right, now, true), height)
      : [];
    this.listAt = layout.leftAt;
    this.detailAt = layout.rightAt;
    return splitFrame(t, {
      layout,
      width,
      title: TITLE,
      count: list.items.length,
      left,
      right,
      hints: this.hints(),
      notice: message,
    });
  }
}
