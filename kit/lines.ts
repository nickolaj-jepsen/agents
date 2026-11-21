/**
 * Styled lines: what a terminal component draws before a client paints it. pi and Claude Code's
 * terminal are both cell grids, so a component is drawn once, here, and each client only paints
 * the result (`paint/pi.ts`, `paint/claude.tsx`). No host imports.
 */

/** A colour role of the style. Each painter maps it to its own theme. */
export type Role = "text" | "dim" | "accent" | "success" | "warning" | "error";

export type Span = { text: string; role?: Role; bold?: boolean; underline?: boolean };

/** One row of cells. `hit` names the control the row belongs to: a click anywhere on it presses it. */
export type Line = { spans: Span[]; hit?: string };

export const span = (text: string, style: Omit<Span, "text"> = {}): Span => ({ text, ...style });

export const line = (spans: Span[], hit?: string): Line =>
  hit === undefined ? { spans } : { spans, hit };

/** A line's characters, without its styles. */
export const textOf = (l: Line) => l.spans.map((s) => s.text).join("");

/** Cells a code point takes: 0 for marks and joiners, 2 for East Asian wide and emoji. */
const cellsOf = (c: number): number => {
  if (c < 32 || (c >= 0x7f && c < 0xa0)) return 0;
  if (c < 0x300) return 1;
  if (
    (c >= 0x300 && c <= 0x36f) ||
    (c >= 0x200b && c <= 0x200f) ||
    (c >= 0x20d0 && c <= 0x20ff) ||
    (c >= 0xfe00 && c <= 0xfe0f) ||
    c === 0xfeff ||
    (c >= 0xe0100 && c <= 0xe01ef)
  )
    return 0;
  return (c >= 0x1100 && c <= 0x115f) ||
    c === 0x2329 ||
    c === 0x232a ||
    (c >= 0x231a && c <= 0x231b) ||
    (c >= 0x23e9 && c <= 0x23ec) ||
    c === 0x23f0 ||
    c === 0x23f3 ||
    (c >= 0x25fd && c <= 0x25fe) ||
    (c >= 0x2614 && c <= 0x2615) ||
    (c >= 0x2648 && c <= 0x2653) ||
    c === 0x267f ||
    c === 0x2693 ||
    c === 0x26a1 ||
    (c >= 0x26aa && c <= 0x26ab) ||
    (c >= 0x26bd && c <= 0x26be) ||
    (c >= 0x26c4 && c <= 0x26c5) ||
    c === 0x26ce ||
    c === 0x26d4 ||
    c === 0x26ea ||
    (c >= 0x26f2 && c <= 0x26f3) ||
    c === 0x26f5 ||
    c === 0x26fa ||
    c === 0x26fd ||
    c === 0x2705 ||
    (c >= 0x270a && c <= 0x270b) ||
    c === 0x2728 ||
    c === 0x274c ||
    c === 0x274e ||
    (c >= 0x2753 && c <= 0x2755) ||
    c === 0x2757 ||
    (c >= 0x2795 && c <= 0x2797) ||
    c === 0x27b0 ||
    c === 0x27bf ||
    (c >= 0x2b1b && c <= 0x2b1c) ||
    c === 0x2b50 ||
    c === 0x2b55 ||
    (c >= 0x2e80 && c <= 0x303e) ||
    (c >= 0x3041 && c <= 0x33ff) ||
    (c >= 0x3400 && c <= 0x4dbf) ||
    (c >= 0x4e00 && c <= 0xa4cf) ||
    (c >= 0xa960 && c <= 0xa97f) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe10 && c <= 0xfe19) ||
    (c >= 0xfe30 && c <= 0xfe6f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6) ||
    (c >= 0x1f300 && c <= 0x1f64f) ||
    (c >= 0x1f680 && c <= 0x1f6ff) ||
    (c >= 0x1f900 && c <= 0x1f9ff) ||
    (c >= 0x1fa70 && c <= 0x1faff) ||
    (c >= 0x20000 && c <= 0x3fffd)
    ? 2
    : 1;
};

/** Cells `text` takes: wide characters two, marks and joiners none. Never `.length`. */
export function cellWidth(text: string): number {
  let n = 0;
  for (const ch of text) n += cellsOf(ch.codePointAt(0) ?? 0);
  return n;
}

/** Cells a line takes. */
export const widthOf = (l: Line) => cellWidth(textOf(l));

/** The longest start of `text` that fits `cells`, and the rest. */
function split(text: string, cells: number): [head: string, rest: string] {
  let used = 0;
  let at = 0;
  for (const ch of text) {
    const w = cellsOf(ch.codePointAt(0) ?? 0);
    if (used + w > cells) break;
    used += w;
    at += ch.length;
  }
  return [text.slice(0, at), text.slice(at)];
}

/** Greedy word wrap in cells; a word longer than the width is broken, and a `\n` ends a line. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    let used = 0;
    const words = paragraph.split(/[ \t]+/).filter(Boolean);
    if (words.length === 0) out.push("");
    for (let word of words) {
      let w = cellWidth(word);
      if (used > 0 && used + 1 + w <= width) {
        line += ` ${word}`;
        used += 1 + w;
        continue;
      }
      if (used > 0) out.push(line);
      line = "";
      used = 0;
      while (w > width) {
        const [head, rest] = split(word, width);
        out.push(head);
        word = rest;
        w = cellWidth(word);
      }
      line = word;
      used = w;
    }
    if (words.length > 0) out.push(line);
  }
  return out;
}
