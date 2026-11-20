import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { BandCell, BandRow } from "./band.ts";
import { paint, tokens } from "./tokens.ts";

export type KeyChip<A = never> = {
  /** The printed key or key range. The caller owns the actual binding. */
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
};

/** Key chips and keyboard-only labels. Hit ranges include only the visible cells of buttons. */
export function buttonRow<A>(
  theme: Theme,
  width: number,
  keys: readonly KeyChip<A>[],
  { wrap = false, lead = "" }: ButtonRowOptions = {},
): BandRow<A>[] {
  const gap = " ".repeat(tokens.gutter);
  const chips = keys.map(({ hotkey, label, act, isLit, essential }) => {
    const text =
      act === undefined
        ? paint(theme, "dim", `${hotkey} ${label}`)
        : paint(theme, "accent", hotkey) + " " + (isLit ? theme.bold(label) : label);
    return { text, act, essential, width: visibleWidth(text) };
  });
  const prefix = truncateToWidth(lead, width, tokens.glyph.ellipsis);
  if (!wrap) {
    let remaining =
      visibleWidth(prefix) +
      chips.reduce((n, chip) => n + chip.width + tokens.gutter, 0) -
      (prefix || !chips.length ? 0 : tokens.gutter);
    while (remaining > width) {
      const index = chips.map((chip) => !chip.essential).lastIndexOf(true);
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
    text += (text ? gap : "") + truncateToWidth(chip.text, width - start, tokens.glyph.ellipsis);
    if (chip.act !== undefined) cells.push({ start, end: visibleWidth(text), act: chip.act });
  }
  rows.push({ text, cells });
  return rows;
}
