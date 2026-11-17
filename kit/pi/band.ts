import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { paint, tokens } from "./tokens.ts";

/** A target on one cell range of a row. */
export type BandCell<A> = { start: number; end: number; act: A };

/**
 * One row of a band's body or footer: its text (already painted), and what a click does, as
 * one target for the whole row or one per cell range (the footer's key chips).
 */
export type BandRow<A = never> = { text: string; act?: A; cells?: BandCell<A>[] };

/** Rows kept for the transcript and the footer around a band. */
export const BAND_RESERVED = 8;
/** The rows a band's frame takes round its body: the top, a gap, the footer and the bottom. */
const CHROME = 4;
/** Body rows a band keeps even where the terminal is tiny. */
const MIN_BODY = 4;

/**
 * How many body rows a band stands at: as many as its tallest state (`height`), within what the
 * terminal leaves it, so going from one state to the next moves nothing.
 * @param height The rows the tallest state takes; leave out to take all that fit.
 * @param maxRows The terminal's rows.
 * @param reserved Rows kept for what is around the band.
 */
export const bandRows = (height: number | undefined, maxRows: number, reserved = BAND_RESERVED) =>
  Math.min(Math.max(MIN_BODY, maxRows - reserved - CHROME), Math.max(MIN_BODY, height ?? Infinity));

export type BandOptions<A> = {
  /** The band's outer width in cells, borders included. */
  width: number;
  /** Accent text after the top border's lead rule. */
  title: string;
  /**
   * After the title: what the form puts in the divider, as its forms widest first (the question
   * stops, then just `2 of 3`). The first that leaves the rule a cell is drawn; its cells are
   * clickable. Left out when undefined.
   */
  right?: BandRow<A>[];
  /** The terminal's rows, for `bandRows`. */
  maxRows: number;
  /** Body rows the tallest state takes; leave out to take all that fit. */
  height?: number;
  /**
   * Rows kept free round the band.
   * @default 8
   */
  reserved?: number;
  /**
   * A blank row between the top border and the body, for a band with room to spare.
   * @default false
   */
  isRoomy?: boolean;
  /** The body, scrolled by `offset` when it is taller than the band. */
  body: BandRow<A>[];
  /** The first body row shown; kept within the body. */
  offset?: number;
  /** Last, so its keys keep their row whatever the body holds. */
  footer?: BandRow<A>;
  /** In the bottom border, dim: what the keys do. A note on scrolling is put before it. */
  keys: string;
};

/** What `bandShell` drew. */
export type Band<A> = {
  /** The frame's lines, `width` cells each. */
  lines: string[];
  /** Frame line → its row, for `bandAct`. Targets are measured from the row's own start. */
  hits: Map<number, BandRow<A>>;
  /** The first body row shown, kept within the body. */
  offset: number;
  /** The most `offset` can be: 0 when the body fits. */
  maxOffset: number;
};

/**
 * The band's shell: a rounded border with the title and its slot in the top, the body under
 * it standing as tall as the tallest state (`bandRows`), the footer below it and the keys in
 * the bottom border. A body taller than the room scrolls above the footer.
 * @param o The width, title, body, footer and keys.
 */
export function bandShell<A>(theme: Theme, o: BandOptions<A>): Band<A> {
  const b = tokens.border;
  const border = (s: string) => paint(theme, "border", s);
  const inner = o.width - 2;
  const textWidth = inner - 2 * tokens.padding;
  const room = bandRows(o.height, o.maxRows, o.reserved);
  const body = [...o.body];
  while (body.length && !body[body.length - 1]?.text) body.pop();
  const maxOffset = Math.max(0, body.length - room);
  const offset = Math.max(0, Math.min(o.offset ?? 0, maxOffset));
  const shown = body.slice(offset, offset + room);
  // Padded to that height, so a short state doesn't shrink the band under the prompt.
  while (shown.length < room) shown.push({ text: "" });
  const rows: BandRow<A>[] = [
    ...(o.isRoomy ? [{ text: "" }] : []),
    ...shown,
    { text: "" },
    o.footer ?? { text: "" },
  ];

  const title = ` ${paint(theme, "accent", o.title)}`;
  const lead = border(b.tl + b.h) + title;
  // The widest form of the slot that leaves the rule at least one cell before the corner.
  const slot = (o.right ?? []).find(
    (r) => visibleWidth(lead) + tokens.gutter + visibleWidth(r.text) + 3 <= o.width,
  );
  // Cut to the border, so the corner is always there.
  const keys = ` ${truncateToWidth(`${maxOffset ? "shift+↑↓ scrolls · " : ""}${o.keys}`, Math.max(1, o.width - 5), tokens.glyph.ellipsis)} `;
  const bottomFill = Math.max(0, inner - 1 - visibleWidth(keys));
  const top = lead + (slot ? `${" ".repeat(tokens.gutter)}${slot.text}` : "") + " ";
  const topFill = Math.max(0, o.width - visibleWidth(top) - 1);
  const pad = " ".repeat(tokens.padding);
  const cell = (s: string) =>
    border(b.v) + pad + truncateToWidth(s, textWidth, "…", true) + pad + border(b.v);
  const lines = [
    top + border(b.h.repeat(topFill)) + border(b.tr),
    ...rows.map((row) => cell(row.text)),
    border(b.bl + b.h.repeat(bottomFill)) + paint(theme, "dim", keys) + border(b.h + b.br),
  ];

  // Targets are measured from the text's own start, one padding column in.
  const hits = new Map<number, BandRow<A>>();
  rows.forEach((row, i) => {
    if (row.act === undefined && !row.cells) return;
    hits.set(i + 1, {
      ...row,
      cells: row.cells?.map((c) => ({ ...c, start: c.start + 1, end: c.end + 1 })),
      text: ` ${row.text}`,
    });
  });
  // The slot's cells are in the top border, measured from the frame's left edge.
  if (slot?.cells) {
    const at = visibleWidth(lead) + tokens.gutter;
    hits.set(0, {
      text: "",
      cells: slot.cells.map((c) => ({ ...c, start: c.start + at - 1, end: c.end + at - 1 })),
    });
  }
  return { lines, hits, offset, maxOffset };
}

/**
 * What a pointer at (`x`, `y`) of the band hits: a chip by its columns, else the row's own
 * target where its text reaches. Coordinates are zero-based from the band's top-left cell.
 * @param band What `bandShell` drew.
 */
export function bandAct<A>(band: Pick<Band<A>, "hits">, x: number, y: number): A | undefined {
  const row = band.hits.get(y);
  const at = x - 1;
  return (
    row?.cells?.find((c) => at >= c.start && at < c.end)?.act ??
    (row?.act !== undefined && at < visibleWidth(row.text.trimEnd()) ? row.act : undefined)
  );
}

/** One key chip of a footer. */
export type Chip<A> = { key: string; label: string; act: A };

/**
 * The footer's keys in one row, `tokens.gutter` apart: each `key label`, the key in the accent
 * and the label plain, with its own click target.
 * @param chips The keys, in order.
 */
export function chipRow<A>(theme: Theme, chips: Chip<A>[]): BandRow<A> {
  let text = "";
  const cells: BandCell<A>[] = [];
  for (const { key, label, act } of chips) {
    if (text) text += " ".repeat(tokens.gutter);
    const start = visibleWidth(text);
    text += `${paint(theme, "accent", key)} ${label}`;
    cells.push({ start, end: visibleWidth(text), act });
  }
  return { text, cells };
}
