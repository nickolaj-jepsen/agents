import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { BandCell, BandRow } from "./band.ts";
import { controlLabel } from "./blocks.ts";
import { paint, tokens } from "./tokens.ts";

export type KeyChip<A = never> = {
  /** Key or key range, without brackets. The caller owns the actual binding. */
  hotkey: string;
  label: string;
  /** The click action. Omit it for a dim, keyboard-only label. */
  act?: A;
  /** Emphasise the suggested action. */
  isLit?: boolean;
  /** Retain this entry when fitting a single row, even at the cost of its label. */
  essential?: boolean;
};

export type ButtonRowOptions = {
  /** Wrap whole entries instead of dropping lower-priority entries. @default false */
  wrap?: boolean;
  /** Non-interactive, already styled text before the first entry (e.g. progress). */
  lead?: string;
  /** Cell under the pointer, relative to the returned rows. */
  hover?: { x: number; y: number };
};

/** A left-aligned row of label-first actions and dim keyboard hints. Only actions have hit ranges. */
export function buttonRow<A>(
  theme: Theme,
  width: number,
  keys: readonly KeyChip<A>[],
  { wrap = false, lead = "", hover }: ButtonRowOptions = {},
): BandRow<A>[] {
  const gap = " ".repeat(tokens.gutter);
  const chips = keys.map((key) => {
    const shortcut =
      key.act === undefined
        ? key.hotkey
        : key.hotkey === "enter"
          ? tokens.glyph.enter
          : `[${key.hotkey}]`;
    return { ...key, shortcut, width: visibleWidth(`${key.label} ${shortcut}`) };
  });
  const prefix = truncateToWidth(lead, width, tokens.glyph.ellipsis);
  if (!wrap) {
    let remaining =
      visibleWidth(prefix) +
      chips.reduce((n, chip) => n + chip.width + tokens.gutter, 0) -
      (prefix || !chips.length ? 0 : tokens.gutter);
    while (remaining > width) {
      const index = chips.map((chip) => !chip.essential && !chip.isLit).lastIndexOf(true);
      if (index < 0) break;
      remaining -= chips.splice(index, 1)[0]!.width + tokens.gutter;
    }
  }
  const rows: BandRow<A>[] = [];
  let text = prefix;
  let cells: BandCell<A>[] = [];
  for (const chip of chips) {
    if (wrap && text && visibleWidth(text) + tokens.gutter + chip.width > width) {
      rows.push({ text, cells });
      text = "";
      cells = [];
    }
    const start = visibleWidth(text) + (text ? tokens.gutter : 0);
    if (start >= width) break;
    const highlighted =
      hover?.y === rows.length && hover.x >= start && hover.x < start + chip.width;
    const label =
      chip.act === undefined
        ? paint(theme, "dim", `${chip.shortcut} ${chip.label}`)
        : controlLabel(theme, { primary: chip.isLit, highlighted }).text(chip.label) +
          " " +
          paint(theme, "dim", chip.shortcut);
    text += (text ? gap : "") + truncateToWidth(label, width - start, tokens.glyph.ellipsis);
    if (chip.act !== undefined) cells.push({ start, end: visibleWidth(text), act: chip.act });
  }
  rows.push({ text, cells });
  return rows;
}
