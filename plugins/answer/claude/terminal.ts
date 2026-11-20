/**
 * What only the terminal measures: the rows the form takes, so the band stands as tall as its
 * tallest question and gives up its blank rows, then the body's lines, before it overflows. A
 * graphical surface has no rows to count, so none of this runs there.
 */
import { view as viewOf } from "../core/forms";
import type { Current, Item } from "./types.d.ts";
import { cellWidth, rowsOf, tokens } from "./ui";

/** Lines wider than this share of the band are guessed to wrap early, and get a row to spare. */
const WRAP_SHARE = 0.7;
/** The blank rows a form can have: under the divider and under the title, both, one or none. */
export const GAPS = [2, 1, 0] as const;
export type Gaps = (typeof GAPS)[number];
/** The room a review row's mark and its key take: `1: `. */
export const KEY_CELLS = 3;

/** What a key row offers, so its width is known before it is drawn. */
export type KeySpec = { hotkey: string; label: string; kind: string; isLit?: boolean };

/** The keys of the shown screen. */
export function keysOf(c: Current): KeySpec[] {
  const { view } = c;
  const fold: KeySpec[] = [{ hotkey: "q", label: "quit", kind: "quit" }];
  if (!view.item)
    return [
      { hotkey: "h", label: "back", kind: "back" },
      { hotkey: "n", label: "note", kind: "note" },
      { hotkey: "s", label: "send", kind: "send" },
      ...fold,
    ];
  const { item } = view;
  const chosen = item.entries.some((row) => row.isChosen);
  return [
    { hotkey: "h", label: "back", kind: "back" },
    { hotkey: "l", label: "next", kind: "next", isLit: chosen },
    ...(item.canAccept
      ? [{ hotkey: "y", label: `take ${item.accepts}`, kind: "accept", isLit: !chosen }]
      : []),
    { hotkey: "s", label: "skip", kind: "skip" },
    { hotkey: "n", label: "note", kind: "note" },
    ...fold,
  ];
}

/** Rows a key row takes at a width: it wraps once the keys outrun the line. */
export function keyRows(keys: KeySpec[], columns: number) {
  const cells = keys.reduce((n, key) => n + cellWidth(`${key.hotkey}: ${key.label}`), 0);
  return Math.max(1, Math.ceil((cells + tokens.keyGap * (keys.length - 1)) / Math.max(1, columns)));
}

/** The rows one question takes besides its body. */
export function chromeRows(c: Current, item: Item, columns: number, gaps: Gaps) {
  const entries = item.entries.reduce(
    (n, entry) =>
      n +
      rowsOf(`1: ○ ${entry.text} (recommended)`, columns) +
      (entry.detail ? rowsOf(entry.detail, columns - 3) : 0),
    0,
  );
  const said = item.recommended
    ? rowsOf(`Recommended: ${item.recommended}`, columns) + (gaps ? 1 : 0)
    : 0;
  // The divider and the gap under it, the gap under the title, a note, and the keys, wrapped
  // when narrow.
  const fixed = 1 + gaps + 1 + keyRows(keysOf(c), columns);
  // A row to spare where a line may wrap earlier than its width says.
  const texts = [item.title, item.recommended, ...item.entries.map((entry) => entry.text)];
  const slack = texts.some((text) => cellWidth(text) > columns * WRAP_SHARE) ? 1 : 0;
  return fixed + rowsOf(item.title, columns) + entries + said + slack;
}

/** How tall the form stands: as its tallest question, so going from one to the next moves nothing. */
export const heightOf = (c: Current, columns: number, gaps: Gaps = 2) =>
  Math.max(
    ...c.held.form.items.map((_, step) => {
      const { item } = viewOf(c.held.form, { ...c.held.draft, step });
      if (!item) return 0;
      const shown = { ...c, view: viewOf(c.held.form, { ...c.held.draft, step }) };
      return chromeRows(shown, item, columns, gaps) + (item.body ? rowsOf(item.body, columns) : 0);
    }),
  );

/**
 * As much of a question's body as the form's rows leave once the title, entries and keys
 * are drawn: a digit only answers an entry on screen, so the body is what gives way.
 */
export function fitBody(c: Current, item: Item, rows: number, columns: number, gaps: Gaps) {
  const { body } = item;
  const left = rows - chromeRows(c, item, columns, gaps);
  if (!body || rowsOf(body, columns) <= left) return { body, isCut: false };
  const kept: string[] = [];
  let used = 1;
  for (const line of body.split("\n")) {
    used += rowsOf(line, columns);
    if (used > left) break;
    kept.push(line);
  }
  // A code fence cut open would swallow what follows it.
  if (kept.filter((line) => /^\s*(```|~~~)/.test(line)).length % 2) kept.push("```");
  return { body: kept.join("\n").trim(), isCut: true };
}
