import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { clamp, fit, type ClampOptions } from "./text.ts";
import { paint, tokens } from "./tokens.ts";

/** One dated entry of a log, a history or a list of evidence. */
export type Entry = {
  /** Shown as given in a dim column, `2026-11-13`. */
  date: string;
  text: string;
};

export type EntriesOptions = {
  /** Passed to `clamp` for every entry's text. */
  lines?: ClampOptions;
  /**
   * The most lines the block may take. A last entry that does not fit is cut with `…` at the
   * end of its last text line; entries left out whole are counted on a dim `↓ n more` line.
   * Never a line that is only an ellipsis. No limit when undefined.
   */
  rows?: number;
};

/**
 * Dated entries, one blank row between them and no bullets or gutter. From
 * `tokens.entriesFrom` columns the date is a fixed dim column at the left and the text
 * hangs beside it; narrower, a dim date line with the text under it at full width.
 *
 * @param width the pane's width in cells
 * @param items the entries, in the order to show them
 */
export function entries(
  theme: Theme,
  width: number,
  items: Entry[],
  options: EntriesOptions = {},
): string[] {
  const wide = width >= tokens.entriesFrom;
  const indent = tokens.dateWidth + tokens.gutter;
  const one = (item: Entry, rows = Infinity): string[] => {
    const date = truncateToWidth(item.date, wide ? tokens.dateWidth : width, tokens.glyph.ellipsis);
    const textRows = wide ? rows : rows - 1;
    const bound = { ...options.lines, max: Math.min(options.lines?.max ?? Infinity, textRows) };
    if (wide) {
      const text = clamp(item.text, width - indent, bound);
      const head = paint(theme, "dim", fit(date, tokens.dateWidth)) + " ".repeat(tokens.gutter);
      if (text.length === 0) return [head.trimEnd()];
      return text.map(
        (line, n) => (n === 0 ? head : " ".repeat(indent)) + paint(theme, "text", line),
      );
    }
    return [
      paint(theme, "dim", date),
      ...clamp(item.text, width, bound).map((line) => paint(theme, "text", line)),
    ];
  };
  const more = (n: number) => paint(theme, "dim", `${tokens.glyph.more.down} ${n} more`);
  const limit = options.rows ?? Infinity;
  const out: string[] = [];
  for (const [i, item] of items.entries()) {
    const sep = i > 0 ? 1 : 0;
    const whole = one(item);
    const left = items.length - i - 1;
    // Room for this entry whole, keeping a line for the marker when entries follow it.
    if (
      out.length + sep + whole.length + (left > 0 ? 1 : 0) <= limit ||
      (left === 0 && out.length + sep + whole.length <= limit)
    ) {
      if (sep) out.push("");
      out.push(...whole);
      continue;
    }
    const room = limit - out.length - sep - (left > 0 ? 1 : 0);
    // A cut entry needs its date and at least one text line.
    const least = wide ? 1 : 2;
    if (room >= least && room < whole.length) {
      if (sep) out.push("");
      out.push(...one(item, room));
      if (left > 0) out.push(more(left));
    } else {
      out.push(more(items.length - i));
    }
    return out.slice(0, Math.max(0, limit));
  }
  return out;
}
