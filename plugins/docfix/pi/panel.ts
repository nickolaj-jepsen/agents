/**
 * The /docfix panel: the open queue grouped by doc, the selected suggestion's
 * evidence under it, and the two answers a person gives one. Dismiss happens
 * in place; apply closes the panel, since the edit is the agent's turn.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type TUI,
} from "@earendil-works/pi-tui";
import { openQueue, seen, type Suggestion } from "../core/docfix.ts";

export type PanelDeps = {
  load(): Promise<Suggestion[]>;
  dismiss(picked: Suggestion[]): Promise<void>;
};

const MARGIN_ROWS = 4;
const DETAIL_ROWS = 8;

const age = (iso: string, now: number) => {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days) || days < 1) return "today";
  return days < 30 ? `${days}d` : `${Math.floor(days / 30)}mo`;
};

export class DocsPanel implements Component {
  private queue: Suggestion[] = [];
  private cursor = 0;
  private scroll = 0;
  private readonly marked = new Set<string>();
  private notice: string | undefined;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly deps: PanelDeps,
    private readonly done: (apply: Suggestion[] | undefined) => void,
  ) {
    void this.reload();
  }

  private async reload() {
    this.queue = openQueue(await this.deps.load());
    for (const id of this.marked) if (!this.queue.some((s) => s.id === id)) this.marked.delete(id);
    this.cursor = Math.min(this.cursor, Math.max(0, this.queue.length - 1));
    this.tui.requestRender();
  }

  invalidate() {}

  /** The marked suggestions, or the one under the cursor when none is marked. */
  private picked(): Suggestion[] {
    const marked = this.queue.filter((s) => this.marked.has(s.id));
    if (marked.length > 0) return marked;
    const current = this.queue[this.cursor];
    return current ? [current] : [];
  }

  handleInput(data: string): void {
    this.notice = undefined;
    if (matchesKey(data, Key.escape) || data === "q") return this.done(undefined);
    if (this.queue.length === 0) return;
    if (matchesKey(data, Key.up) || data === "k") this.cursor = Math.max(0, this.cursor - 1);
    else if (matchesKey(data, Key.down) || data === "j")
      this.cursor = Math.min(this.queue.length - 1, this.cursor + 1);
    else if (data === " " || data === "x") {
      const id = this.queue[this.cursor]?.id;
      if (id && !this.marked.delete(id)) this.marked.add(id);
    } else if (data === "a" || matchesKey(data, Key.enter)) return this.done(this.picked());
    else if (data === "d") {
      const picked = this.picked();
      void this.deps.dismiss(picked).then(
        () => {
          this.notice = `Dismissed ${picked.length}`;
          return this.reload();
        },
        (error) => {
          this.notice = `Dismiss failed: ${String(error)}`;
          this.tui.requestRender();
        },
      );
    } else return;
    this.tui.requestRender();
  }

  render(width: number): string[] {
    const t = this.theme;
    const inner = Math.max(10, width - 4);
    const border = (s: string) => t.fg("borderMuted", s);
    const pad = (line: string) => {
      const cut = truncateToWidth(line, inner, "…");
      return border("│ ") + cut + " ".repeat(Math.max(0, inner - visibleWidth(cut))) + border(" │");
    };
    const title = ` Doc suggestions · ${this.queue.length} open `;
    const top =
      border("╭─") +
      t.fg("accent", t.bold(title)) +
      border("─".repeat(Math.max(0, width - 3 - visibleWidth(title))) + "╮");
    const hintText = " ↑↓ move · space mark · a apply · d dismiss · esc later ";
    const hints = visibleWidth(hintText) + 3 <= width ? hintText : "";
    const bottom =
      border("╰" + "─".repeat(Math.max(0, width - 3 - visibleWidth(hints)))) +
      t.fg("dim", hints) +
      border("─╯");

    if (this.queue.length === 0)
      return [
        top,
        pad(t.fg("dim", "Nothing to review: no open doc suggestions in this repo.")),
        bottom,
      ];

    const now = Date.now();
    const rows: { text: string; index?: number }[] = [];
    let last = "";
    this.queue.forEach((s, index) => {
      if (s.target !== last) {
        rows.push({ text: t.fg("accent", s.target) });
        last = s.target;
      }
      const mark = this.marked.has(s.id) ? t.fg("success", "■") : t.fg("dim", "□");
      const meta = t.fg("dim", ` · ${s.kind} · seen ${seen(s)}× · ${age(s.updated, now)}`);
      const line = `${mark} ${s.claim}`;
      const text = index === this.cursor ? t.inverse(line) : line;
      rows.push({ text: `  ${text}${meta}`, index });
    });

    const selected = this.queue[this.cursor];
    const detail = selected
      ? selected.evidence
          .slice(-2)
          .flatMap((e) =>
            wrapTextWithAnsi(t.fg("dim", `${e.at.slice(0, 10)} ${e.session}: `) + e.text, inner),
          )
          .slice(0, DETAIL_ROWS)
      : [];
    const room = Math.max(4, this.tui.terminal.rows - MARGIN_ROWS - 3 - detail.length - 1);
    const at = rows.findIndex((r) => r.index === this.cursor);
    if (at < this.scroll + 1) this.scroll = Math.max(0, at - 1);
    if (at >= this.scroll + room) this.scroll = at - room + 1;
    const shown = rows.slice(this.scroll, this.scroll + room).map((r) => pad(r.text));

    return [
      top,
      ...shown,
      border("├" + "─".repeat(Math.max(0, width - 2)) + "┤"),
      ...detail.map(pad),
      ...(this.notice ? [pad(t.fg("warning", this.notice))] : []),
      bottom,
    ];
  }
}
