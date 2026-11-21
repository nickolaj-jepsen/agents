/** The button row as styled lines: the one drawing both terminals paint. */
import {
  cellWidth,
  line,
  span,
  spansWidth,
  truncateSpans,
  type Line,
  type Span,
} from "../lines.ts";
import { controlStyle } from "../card/terminal.ts";
import { tokens } from "../tokens.ts";
import type { Button, ButtonRowOptions } from "./contract.ts";

/** How a button's key is printed after its label: `↵` for Enter, else in brackets; nothing for none. */
export const shortcutOf = (b: Pick<Button, "hotkey" | "hit">) =>
  b.hit === undefined || !b.hotkey
    ? b.hotkey
    : b.hotkey === "enter"
      ? tokens.glyph.enter
      : `[${b.hotkey}]`;

/**
 * Actions left to right, label first with the key dim after it, the suggested one in the
 * accent; and dim keyboard-only hints, key first. One row drops what is neither suggested nor
 * essential, last first, until it fits; with `wrap` nothing drops.
 */
export function buttonRow(
  keys: readonly Button[],
  width: number,
  { wrap = false, lead = [], hover }: ButtonRowOptions = {},
): Line[] {
  const chips = keys.map((key) => {
    const shortcut = shortcutOf(key);
    return {
      ...key,
      shortcut,
      width: cellWidth(shortcut ? `${key.label} ${shortcut}` : key.label),
    };
  });
  const prefix = truncateSpans(lead, width);
  if (!wrap) {
    let remaining =
      spansWidth(prefix) +
      chips.reduce((n, chip) => n + chip.width + tokens.gutter, 0) -
      (prefix.length || !chips.length ? 0 : tokens.gutter);
    while (remaining > width) {
      const index = chips.map((chip) => !chip.essential && !chip.isLit).lastIndexOf(true);
      if (index < 0) break;
      remaining -= (chips.splice(index, 1)[0]?.width ?? 0) + tokens.gutter;
    }
  }
  const rows: Line[] = [];
  let spans: Span[] = [...prefix];
  for (const chip of chips) {
    if (wrap && spans.length && spansWidth(spans) + tokens.gutter + chip.width > width) {
      rows.push(line(spans));
      spans = [];
    }
    const start = spansWidth(spans) + (spans.length ? tokens.gutter : 0);
    if (start >= width) break;
    const isHovered = hover?.y === rows.length && hover.x >= start && hover.x < start + chip.width;
    const entry: Span[] =
      chip.hit === undefined
        ? [span(`${chip.shortcut} ${chip.label}`, { role: "dim" })]
        : [
            span(chip.label, {
              ...controlStyle({ primary: chip.isLit, highlighted: isHovered }),
              hit: chip.hit,
            }),
            ...(chip.shortcut
              ? [span(" ", { hit: chip.hit }), span(chip.shortcut, { role: "dim", hit: chip.hit })]
              : []),
          ];
    if (spans.length) spans.push(span(" ".repeat(tokens.gutter)));
    spans.push(...truncateSpans(entry, width - start));
  }
  rows.push(line(spans));
  return rows;
}
