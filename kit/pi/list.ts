import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  truncateToWidth,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { section } from "./blocks.ts";
import { alignRight, clamp, fit, type ClampOptions } from "./text.ts";
import { paint, tokens, type Role } from "./tokens.ts";

/** A right-aligned metadata field, one fixed width on every row. */
export type Column<T> = {
  /** Cells, the same on every row so the field can be scanned downwards. */
  width: number;
  /** Higher survives longer: the lowest is hidden first when the row is narrow. */
  priority: number;
  /** The field's value, cut to `width` with `…`. */
  text(item: T): string;
  /** A colour that marks a threshold or a state; dim when it returns nothing. */
  role?(item: T): Role | undefined;
};

export type ListOptions<T> = {
  /** A stable key: marks follow it when the items are replaced. */
  id(item: T): string;
  /** Items sharing a group sit together under one header. Give them in group order. */
  group?(item: T): string;
  /** The row's text: the content, the last thing cut. */
  title(item: T): string;
  /** Passed to `clamp` for every title. */
  titleLines: ClampOptions;
  /** Metadata fields, right-aligned after the title; the lowest priority drops first. */
  columns: Column<T>[];
  /** `multi` is `□ ■`, `single` is `○ ●`; none leaves the mark column out. */
  marks?: "multi" | "single";
};

type Entry = { lines: string[]; item?: number; header?: boolean };

/** A grouped, scrolling list with a cursor, marks and metadata columns. */
export class List<T> {
  /** The rows, in display order; replace through `setItems`. */
  items: T[] = [];
  /** Index of the selected row. */
  cursor = 0;
  /** Index of the row under the pointer, if any; shown bold. */
  hover: number | undefined;
  /** Ids of the marked rows. */
  readonly marked = new Set<string>();
  private scroll = 0;
  /** Per rendered line: the item it belongs to and whether it is that item's first. */
  private shown: ({ item: number; first: boolean } | undefined)[] = [];

  private readonly o: ListOptions<T>;

  // No parameter property: the e2e scenarios load the kit under Node's type stripping.
  constructor(o: ListOptions<T>) {
    this.o = o;
  }

  /** Replaces the items; marks of items that are gone are dropped and the cursor kept in range. */
  setItems(items: T[]) {
    this.items = items;
    const ids = new Set(items.map(this.o.id));
    for (const id of this.marked) if (!ids.has(id)) this.marked.delete(id);
    this.cursor = Math.min(this.cursor, Math.max(0, items.length - 1));
    this.hover = undefined;
  }

  /** The item under the cursor. */
  get current(): T | undefined {
    return this.items[this.cursor];
  }

  /** Moves the cursor by `delta` rows, clamped to the list, and clears the hover. */
  move(delta: number) {
    this.hover = undefined;
    this.cursor = Math.max(0, Math.min(this.items.length - 1, this.cursor + delta));
  }

  /** Marks or unmarks the item; `single` clears any other mark first. */
  toggle(index = this.cursor) {
    const item = this.items[index];
    if (item === undefined) return;
    const id = this.o.id(item);
    if (this.marked.delete(id)) return;
    if (this.o.marks === "single") this.marked.clear();
    this.marked.add(id);
  }

  /** The marked items, or the one under the cursor when none is marked. */
  picked(): T[] {
    const marked = this.items.filter((item) => this.marked.has(this.o.id(item)));
    if (marked.length > 0) return marked;
    return this.current === undefined ? [] : [this.current];
  }

  private prefixWidth() {
    return this.o.marks ? 4 : 2;
  }

  /** The columns that fit beside a title of at least `minTitle` cells, in their own order. */
  private columnsFor(width: number): Column<T>[] {
    const keep = new Set<Column<T>>();
    let room = width - this.prefixWidth() - tokens.minTitle;
    for (const c of [...this.o.columns].sort((a, b) => b.priority - a.priority)) {
      if (room < c.width + tokens.gutter) break;
      keep.add(c);
      room -= c.width + tokens.gutter;
    }
    return this.o.columns.filter((c) => keep.has(c));
  }

  private entries(theme: Theme, width: number, blanks: boolean): Entry[] {
    const o = this.o;
    const cols = this.columnsFor(width);
    const meta = cols.reduce((sum, c) => sum + c.width + tokens.gutter, 0);
    const titleWidth = Math.max(1, width - this.prefixWidth() - meta);
    const glyphs = o.marks === "single" ? tokens.glyph.single : tokens.glyph.multi;
    const out: Entry[] = [];
    let group: string | undefined;
    this.items.forEach((item, index) => {
      const name = o.group?.(item);
      if (name !== undefined && name !== group) {
        if (group !== undefined && blanks) out.push({ lines: [""] });
        out.push({ lines: [section(theme, width, name)], header: true });
        group = name;
      }
      const selected = index === this.cursor;
      const lit = !selected && index === this.hover;
      const style = (s: string) =>
        selected
          ? paint(theme, "accent", s)
          : lit
            ? theme.bold(paint(theme, "text", s))
            : paint(theme, "text", s);
      const on = this.marked.has(o.id(item));
      const mark = o.marks
        ? (on ? paint(theme, "accent", glyphs.on) : paint(theme, "dim", glyphs.off)) + " "
        : "";
      const pointer = (selected ? paint(theme, "accent", tokens.glyph.pointer) : " ") + " ";
      const metadata = cols
        .map((c) => {
          const text = alignRight(
            truncateToWidth(c.text(item), c.width, tokens.glyph.ellipsis),
            c.width,
          );
          return " ".repeat(tokens.gutter) + paint(theme, c.role?.(item) ?? "dim", text);
        })
        .join("");
      const title = clamp(o.title(item), titleWidth, o.titleLines);
      out.push({
        item: index,
        lines: title.map((line, i) =>
          i === 0
            ? pointer + mark + fit(style(line), titleWidth) + metadata
            : " ".repeat(this.prefixWidth()) + style(line),
        ),
      });
    });
    return out;
  }

  /** Lines the whole list takes at `width`, blank rows between groups included. */
  naturalRows(theme: Theme, width: number): number {
    return this.entries(theme, width, true).reduce((n, e) => n + e.lines.length, 0);
  }

  /**
   * At most `rows` lines. Blank rows between groups only while everything fits. Past that the
   * window scrolls by whole rows, keeping the cursor's row (and its group header) in view,
   * and a dim `↑ n more` / `↓ n more` line stands in for the rows that are hidden.
   */
  render(theme: Theme, width: number, rows: number): string[] {
    let entries = this.entries(theme, width, true);
    const total = (list: Entry[]) => list.reduce((n, e) => n + e.lines.length, 0);
    let flat: Entry[];
    let up = 0;
    let down = 0;
    if (total(entries) <= rows) {
      flat = entries;
    } else {
      entries = this.entries(theme, width, false);
      const n = entries.length;
      const cursorAt = entries.findIndex((e) => e.item === this.cursor);
      const from =
        cursorAt > 0 && entries[cursorAt - 1]!.header ? cursorAt - 1 : Math.max(0, cursorAt);
      const items = (a: number, b: number) =>
        entries.slice(a, b).filter((e) => e.item !== undefined).length;
      // The end of a window starting at `top`, whole entries only, a line kept for each marker.
      const reach = (top: number) => {
        const take = (avail: number) => {
          let end = top;
          let used = 0;
          while (end < n && used + entries[end]!.lines.length <= avail)
            used += entries[end++]!.lines.length;
          return end;
        };
        const head = top > 0 ? 1 : 0;
        let end = take(rows - head);
        if (end < n) end = take(rows - head - 1);
        // A header whose rows are all hidden says nothing.
        while (end > top + 1 && entries[end - 1]!.header) end--;
        return Math.max(end, top + 1);
      };
      let top = Math.min(this.scroll, from);
      while (cursorAt >= reach(top) && top < n - 1) top++;
      // A window that grew: no rows stay hidden above while the end fits with room to spare.
      while (top > 0 && reach(top - 1) === n) top--;
      this.scroll = top;
      const end = reach(top);
      flat = entries.slice(top, end);
      up = top > 0 ? items(0, top) : 0;
      down = end < n ? items(end, n) : 0;
      if (flat.length === 1 && total(flat) > rows)
        flat = [{ ...flat[0]!, lines: flat[0]!.lines.slice(0, rows) }];
    }
    const more = (glyph: string, count: number): Entry => ({
      lines: [" ".repeat(this.prefixWidth()) + paint(theme, "dim", `${glyph} ${count} more`)],
    });
    const shown = [
      ...(up > 0 ? [more(tokens.glyph.more.up, up)] : []),
      ...flat,
      ...(down > 0 ? [more(tokens.glyph.more.down, down)] : []),
    ];
    const lines: { text: string; item?: number; first: boolean }[] = [];
    for (const e of shown)
      e.lines.forEach((text, i) => lines.push({ text, item: e.item, first: i === 0 }));
    this.shown = lines.map((l) =>
      l.item === undefined ? undefined : { item: l.item, first: l.first },
    );
    return lines.map((l) => l.text);
  }

  /** The item under a point of the last render (local cells), and whether it is on the mark. */
  hit(x: number, y: number): { index: number; mark: boolean } | undefined {
    const row = this.shown[y];
    if (!row) return undefined;
    return { index: row.item, mark: row.first && !!this.o.marks && x >= 2 && x <= 3 };
  }

  /** Click selects a row (its mark toggles it); hovering lights one. Coordinates are the list's own. */
  mouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const at = this.hit(event.x, event.y);
    if (event.type === "move") {
      const before = this.hover;
      this.hover = at?.index;
      return { handled: true, render: before !== this.hover };
    }
    if (event.type === "click" && event.button === "left" && at) {
      this.hover = undefined;
      this.cursor = at.index;
      if (at.mark) this.toggle(at.index);
      return { handled: true };
    }
    return undefined;
  }
}
