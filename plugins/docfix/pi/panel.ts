/**
 * The /docfix panel: the open queue grouped by doc, the selected suggestion in full beside
 * it, and the two answers a person gives one. Dismiss happens in place; apply closes the
 * panel, since the edit is the agent's turn. Built on the pi kit (`../../../kit/pi`).
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
};

export const EMPTY_TEXT = "Nothing to review: no open doc suggestions in this repo.";

const TITLE = "Doc suggestions";
const HINTS: Hint[] = [
  { key: "↑↓", label: "move" },
  { key: "space", label: "mark" },
  { key: "a", label: "apply" },
  { key: "d", label: "dismiss" },
  { key: "esc", label: "later", essential: true },
];
const EMPTY_HINTS: Hint[] = [{ key: "esc", label: "close", essential: true }];
/** From this many sessions a suggestion has been hit often enough to flag. */
const SEEN_WARN = 3;
/** Lines of one evidence note before it is cut. */
const NOTE_MAX = 4;
/** Frame rows around the body: the top and bottom borders, the blank rows under and above. */
const FRAME_ROWS = 4;
/** Detail rows that are not the claim: a blank, the meta line, a blank, the header and one note line. */
const FIXED_DETAIL_ROWS = 5;

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
    titleLines: { min: 1, max: 2 },
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
  private detailCache = new Map<string, string[]>();
  /** Where the list's first row sits in the panel's cells, as of the last render. */
  private listAt = { x: 0, y: 0 };

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

  handleInput(data: string): void {
    this.note = undefined;
    if (matchesKey(data, Key.escape) || data === "q") return this.done(undefined);
    const list = this.list;
    if (list.items.length === 0) return;
    if (matchesKey(data, Key.up) || data === "k") list.move(-1);
    else if (matchesKey(data, Key.down) || data === "j") list.move(1);
    else if (data === " " || data === "x") list.toggle();
    else if (data === "a" || matchesKey(data, Key.enter)) return this.done(list.picked());
    else if (data === "d") {
      const picked = list.picked();
      void this.deps.dismiss(picked).then(
        () => {
          this.note = { text: `Dismissed ${picked.length}`, status: "success" };
          return this.reload();
        },
        (error) => {
          this.note = { text: `Dismiss failed: ${String(error)}`, status: "error" };
          this.tui.requestRender();
        },
      );
    } else return;
    this.tui.requestRender();
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (this.list.items.length === 0) return undefined;
    if (event.type === "wheel") {
      this.list.move(Math.sign(event.wheelDelta ?? 0));
      return { handled: true };
    }
    const local = { ...event, x: event.x - this.listAt.x, y: event.y - this.listAt.y };
    const result = this.list.mouse(local);
    if (result?.handled && event.type === "click") this.note = undefined;
    return result;
  }

  /** The selected suggestion in full: the claim, what it is, the evidence under a header rule. */
  private detail(
    s: Suggestion,
    width: number,
    now: number,
    claimMax: number,
    budget: number,
  ): string[] {
    const key = `${width}:${claimMax}:${budget}:${s.id}`;
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
    const head = [
      ...prose(t, width, s.claim, { max: claimMax }),
      "",
      meta,
      "",
      section(t, width, "Evidence"),
    ];
    // What is left under the header is the evidence's: it cuts itself, never to a bare "…".
    const evidence = entries(
      t,
      width,
      [...s.evidence].reverse().map((e) => ({ date: e.at.slice(0, 10), text: e.text })),
      { lines: { max: NOTE_MAX }, rows: Math.max(0, budget - head.length) },
    );
    const lines = [
      ...head,
      ...(s.evidence.length > 0 ? evidence : [paint(t, "dim", "none filed")]),
    ].slice(0, budget);
    this.detailCache.set(key, lines);
    return lines;
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
      return modalFrame(t, {
        width,
        title: TITLE,
        body: emptyState(t, content, EMPTY_TEXT),
        hints: EMPTY_HINTS,
        notice: message,
      });
    }

    const layout = splitLayout(width, this.tui.terminal.columns);
    const current = list.current;
    // The tallest detail sets the height, so the panel stays put as the cursor moves.
    const tallest = (w: number, claimMax: number, budget: number) =>
      list.items.reduce((n, s) => Math.max(n, this.detail(s, w, now, claimMax, budget).length), 0);

    if (layout.stacked) {
      // The claim is in the list above, so the detail gives way to the meta line and evidence.
      const share = Math.max(9, Math.floor((rows - 1) * 0.45));
      const claimMax = Math.max(1, share - FIXED_DETAIL_ROWS - 1);
      const d = tallest(content, claimMax, share);
      const shown = list.render(
        t,
        content,
        Math.min(list.naturalRows(t, content), Math.max(1, rows - 1 - d)),
      );
      const detail = current ? [...this.detail(current, content, now, claimMax, d)] : [];
      while (detail.length < d) detail.push("");
      this.listAt = bodyOrigin;
      return modalFrame(t, {
        width,
        title: TITLE,
        count: list.items.length,
        body: [...shown, "", ...detail],
        hints: HINTS,
        notice: message,
      });
    }

    const claimMax = Math.max(3, rows - FIXED_DETAIL_ROWS);
    const height = Math.max(
      1,
      Math.min(
        rows,
        Math.max(list.naturalRows(t, layout.left), tallest(layout.right, claimMax, rows)),
      ),
    );
    const left = list.render(t, layout.left, height);
    const right = current ? this.detail(current, layout.right, now, claimMax, height) : [];
    this.listAt = layout.leftAt;
    return splitFrame(t, {
      layout,
      width,
      title: TITLE,
      count: list.items.length,
      left,
      right,
      hints: HINTS,
      notice: message,
    });
  }
}
