/**
 * Styled lines: what a terminal component draws before a client paints it. pi and Claude Code's
 * terminal are both cell grids, so a component is drawn once, here, and each client only paints
 * the result (`paint/pi.ts`, `paint/claude.tsx`). No host imports.
 */

/**
 * A colour role of the style. Each painter maps it to its own theme.
 * - `code` is inline code.
 * - `border` is a rule or a frame's line.
 * - `active` and `answered` are a question card's own: the one the keyboard is on, and one
 *   that has its answer.
 */
export type Role =
  | "text"
  | "dim"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "code"
  | "border"
  | "active"
  | "answered";

export type Style = { role?: Role; bold?: boolean; italic?: boolean; underline?: boolean };

/** A run of one style. `hit` names the control it belongs to, where a row holds several. */
export type Span = Style & { text: string; hit?: string };

/**
 * A block a host draws itself, standing in the drawing as one line: block Markdown, which each
 * client has a renderer for. It takes as many rows as that renderer gives it.
 */
export type Slot = {
  kind: "markdown";
  text: string;
  /** Cells the block is set in by. */
  indent: number;
  /** Cells it may take, after the indent. */
  width: number;
  isDim?: boolean;
  /** Rows it may take; the last of a cut block ends in `…`. */
  max?: number;
};

/** One row of cells. `hit` names the control the whole row belongs to: a click on it presses it. */
export type Line = { spans: Span[]; hit?: string; slot?: Slot };

export const span = (text: string, style: Style & { hit?: string } = {}): Span => ({
  text,
  ...style,
});

export const line = (spans: Span[], hit?: string): Line =>
  hit === undefined ? { spans } : { spans, hit };

/** An empty row. */
export const blank = (): Line => ({ spans: [] });

/** A host-drawn block in the drawing's flow. */
export const slotLine = (slot: Slot): Line => ({ spans: [], slot });

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

/** The glyph a cut text ends in. */
export const ELLIPSIS = "…";

/** `text` cut to `width` cells with `…` when it is longer. */
export function truncate(text: string, width: number): string {
  if (cellWidth(text) <= width) return text;
  return split(text, Math.max(0, width - 1))[0] + ELLIPSIS;
}

/** `text` padded with spaces to `width` cells, cut with `…` when longer. */
export const fit = (text: string, width: number) => {
  const cut = truncate(text, Math.max(0, width));
  return cut + " ".repeat(Math.max(0, width - cellWidth(cut)));
};

export type ClampOptions = {
  /** Fewer lines than this are padded with blank ones, so rows keep one height. @default 0 */
  min?: number;
  /** More lines than this are cut, the last filled to its end before the `…`. @default Infinity */
  max?: number;
};

/**
 * Plain text wrapped to `width` cells and bounded in lines: `{min: 1, max: 1}` truncates to one
 * line; no options wraps without limit.
 */
export function clamp(text: string, width: number, options: ClampOptions = {}): string[] {
  if (width < 1) return [];
  const { min = 0, max = Infinity } = options;
  const cap = Math.max(min, max);
  let lines = wrap(text, width);
  if (lines.length > cap) {
    if (cap === 0) return [];
    // The cut line takes the rest of the text, so it is full before the ellipsis.
    const rest = lines.slice(cap - 1).join(" ");
    lines = [...lines.slice(0, cap - 1), truncate(rest, width)];
  }
  while (lines.length < min) lines.push("");
  return lines;
}

// `code`, **bold** or __bold__, *italic* or _italic_, and a [link](url), which keeps only its
// words. A marker inside a word is a letter of it, as in `snake_case_name`.
const INLINE =
  /`([^`\n]+)`|\*\*([^*\n]+?)\*\*|(?<!\w)__([^_\n]+?)__(?!\w)|(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])|(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])|\[([^\]\n]+)\]\([^)\s]+\)/g;

/**
 * One paragraph of inline Markdown as spans in `style`: code takes the `code` role, bold and
 * italic their faces over the style, and a link keeps its words. Line ends become spaces.
 */
export function inline(text: string, style: Style = {}): Span[] {
  const spans: Span[] = [];
  const flat = text.replace(/\r\n?/g, "\n").split("\n").join(" ");
  let at = 0;
  for (const m of flat.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > at) spans.push({ ...style, text: flat.slice(at, start) });
    const [, code, bold, underscored, italic, slanted, link] = m;
    if (code !== undefined) spans.push({ ...style, text: code, role: "code" });
    else if (bold !== undefined || underscored !== undefined)
      spans.push({ ...style, text: bold ?? underscored ?? "", bold: true });
    else if (italic !== undefined || slanted !== undefined)
      spans.push({ ...style, text: italic ?? slanted ?? "", italic: true });
    else spans.push({ ...style, text: link ?? "" });
    at = start + m[0].length;
  }
  if (at < flat.length) spans.push({ ...style, text: flat.slice(at) });
  return spans;
}

/** Plain text as one span in `style`: what a person typed, which is not Markdown. */
export const literal = (text: string, style: Style = {}): Span[] => [{ ...style, text }];

const sameStyle = (a: Span, b: Span) =>
  a.role === b.role &&
  !a.bold === !b.bold &&
  !a.italic === !b.italic &&
  !a.underline === !b.underline &&
  a.hit === b.hit;

/** Spans in lines of at most `width` cells: greedy by word, a space at a break dropped. */
export function wrapSpans(spans: readonly Span[], width: number): Span[][] {
  const lines: Span[][] = [[]];
  let used = 0;
  const put = (from: Span, text: string) => {
    const row = lines[lines.length - 1] ?? [];
    const last = row[row.length - 1];
    if (last && sameStyle(last, from)) last.text += text;
    else row.push({ ...from, text });
    used += cellWidth(text);
  };
  const end = () => {
    const row = lines[lines.length - 1] ?? [];
    while (row.length) {
      const last = row[row.length - 1];
      if (!last) break;
      last.text = last.text.replace(/ +$/, "");
      if (last.text) break;
      row.pop();
    }
    lines.push([]);
    used = 0;
  };
  for (const from of spans)
    for (const paragraph of from.text.split("\n").map((p, i) => ({ p, isBreak: i > 0 }))) {
      if (paragraph.isBreak) end();
      for (const piece of paragraph.p.replace(/[\t ]/g, " ").split(/( +)/)) {
        if (!piece) continue;
        if (piece.startsWith(" ")) {
          if (used > 0) put(from, piece);
          continue;
        }
        let word = piece;
        if (used > 0 && used + cellWidth(word) > width) end();
        while (cellWidth(word) > width) {
          const [head, rest] = split(word, width);
          put(from, head);
          end();
          word = rest;
        }
        put(from, word);
      }
    }
  const last = lines[lines.length - 1] ?? [];
  const tail = last[last.length - 1];
  if (tail) tail.text = tail.text.replace(/ +$/, "");
  return lines;
}

/** Cells a run of spans takes. */
export const spansWidth = (spans: readonly Span[]) =>
  spans.reduce((n, s) => n + cellWidth(s.text), 0);

export type BlockOptions = {
  /** What the first line starts with: a label, a mark. The text hangs under where it ends. */
  lead?: Span[];
  /** What each later line starts with instead. @default spaces as wide as `lead` */
  hang?: Span[];
  /** More lines than this are cut, the last ending in `…`. @default Infinity */
  max?: number;
  /** The control every line belongs to. */
  hit?: string;
};

/**
 * Spans as lines of `width` cells: wrapped by word after a `lead`, later lines hanging under
 * the first line's text.
 */
export function block(spans: readonly Span[], width: number, options: BlockOptions = {}): Line[] {
  const lead = options.lead ?? [];
  const hang = options.hang ?? (lead.length ? [span(" ".repeat(spansWidth(lead)))] : []);
  const room = Math.max(1, width - spansWidth(lead));
  let rows = wrapSpans(spans, room);
  const max = options.max ?? Infinity;
  if (rows.length > max) {
    rows = rows.slice(0, Math.max(0, max));
    const cut = rows[rows.length - 1];
    const tail = cut?.[cut.length - 1];
    if (cut && tail) {
      const over = spansWidth(cut) + 1 - room;
      if (over > 0) tail.text = split(tail.text, Math.max(0, cellWidth(tail.text) - over))[0];
      cut.push({ ...tail, text: ELLIPSIS });
    }
  }
  return rows.map((row, i) => line([...(i ? hang : lead), ...row], options.hit));
}

/** A line with each of its spans marked as part of `hit`, where the row holds other things too. */
export const hitSpans = (spans: Span[], hit: string): Span[] => spans.map((s) => ({ ...s, hit }));

/** `spans` cut to `width` cells, the last ending in `…` when they were longer. */
export function truncateSpans(spans: readonly Span[], width: number): Span[] {
  if (spansWidth(spans) <= width) return [...spans];
  const out: Span[] = [];
  let room = Math.max(0, width - 1);
  for (const s of spans) {
    if (room <= 0) break;
    const [head] = split(s.text, room);
    if (head) out.push({ ...s, text: head });
    room -= cellWidth(head);
    if (head.length < s.text.length) break;
  }
  const last = out[out.length - 1];
  if (width > 0) out.push({ ...last, text: ELLIPSIS });
  return out;
}
