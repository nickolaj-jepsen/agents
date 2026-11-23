/**
 * Styled lines: what a terminal component draws before a client paints it. pi and Claude Code's
 * terminal are both cell grids, so a component is drawn once, here, and each client only paints
 * the result (`paint/pi.ts`, `paint/claude.tsx`). No host imports.
 */
import { meaningOf, type MeaningName } from "./icons.ts";
import { tokens, type TypeRole } from "./tokens.ts";

/**
 * A colour role of the style. Each painter maps it to its own theme.
 * - `code` is inline code, `link` the words of a link.
 * - `border` is a rule or a frame's line.
 */
export type Role =
  | "text"
  | "dim"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "code"
  | "link"
  | "border";

export type Style = {
  role?: Role;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** The two colours swapped: a badge. */
  inverse?: boolean;
};

/** A run of one style. `hit` names the control it belongs to, where a row holds several. */
export type Span = Style & { text: string; hit?: string };

/** Where an image's bytes are: inline PNG, or a local PNG file for the terminal to read. */
export type ImageSource = { png: string } | { file: string; format: "png"; generation?: number };

/**
 * What a host draws itself, standing in the drawing as one line.
 * - `markdown`: block Markdown, which each client has a renderer for. It takes as many rows as
 *   that renderer gives it.
 * - `input`: the host's own text field, between the cells drawn before and after it.
 * - `image`: a picture, where the host draws one. The line's spans hold what stands in for it
 *   (its alt text), which a terminal with no images shows.
 * - `link`: the line's spans are the words of a link to `href`, where the host has links.
 */
export type Slot =
  | {
      kind: "markdown";
      text: string;
      /** Cells the block is set in by. */
      indent: number;
      /** Cells it may take, after the indent. */
      width: number;
      isDim?: boolean;
      /** Rows it may take; the last of a cut block ends in `…`. */
      max?: number;
    }
  | {
      kind: "input";
      /** What the row starts with: a key, a label. */
      lead: Span[];
      /** What each later row of the field starts with instead. @default spaces as wide as `lead` */
      hang?: Span[];
      /** Cells the field has. */
      width: number;
      /** Rows the field has, for one that wraps what is typed. @default 1 */
      rows?: number;
      /** What stands after the field on each of its rows, such as a frame's edge. */
      tail?: Span[];
    }
  | {
      kind: "image";
      source: ImageSource;
      /** Cells it takes: at most 255 each. */
      columns: number;
      rows: number;
      alt: string;
    }
  | { kind: "link"; href: string };

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

/**
 * The pieces of a word a line may end between: each wide character is one, as East Asian text
 * has no spaces to break at, and a run of narrow ones is one. A mark stays with what it marks.
 */
function units(word: string): string[] {
  const out: string[] = [];
  let run = "";
  for (const ch of word) {
    const w = cellsOf(ch.codePointAt(0) ?? 0);
    if (w === 2) {
      if (run) out.push(run);
      run = "";
      out.push(ch);
    } else if (w === 0 && !run && out.length) out[out.length - 1] += ch;
    else run += ch;
  }
  if (run) out.push(run);
  return out;
}

/**
 * Greedy word wrap in cells: a line ends at a space or between wide characters, a narrow word
 * longer than the width is broken, and a `\n` ends a line.
 */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    let used = 0;
    const words = paragraph.split(/[ \t]+/).filter(Boolean);
    if (words.length === 0) out.push("");
    for (const word of words) {
      let gap = used > 0 ? 1 : 0;
      for (let unit of units(word)) {
        let w = cellWidth(unit);
        if (used > 0 && used + gap + w > width) {
          out.push(line);
          line = "";
          used = 0;
          gap = 0;
        }
        while (w > width) {
          const [head, rest] = split(unit, width);
          out.push(head);
          unit = rest;
          w = cellWidth(unit);
        }
        line += (gap ? " " : "") + unit;
        used += gap + w;
        gap = 0;
      }
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
 * italic their faces over the style, and a link keeps its words, underlined. Line ends become
 * spaces.
 */
export function inline(text: string, style: Style = {}): Span[] {
  const spans: Span[] = [];
  const flat = text.replace(/\r\n?/g, "\n").split("\n").join(" ");
  let at = 0;
  for (const m of flat.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > at) spans.push({ ...style, text: flat.slice(at, start) });
    const [, code, bold, underscored, italic, slanted, link] = m;
    // Code keeps its own face, as a Markdown renderer sets it: not the bold of a title round it.
    if (code !== undefined) spans.push({ text: code, role: "code" });
    else if (bold !== undefined || underscored !== undefined)
      spans.push({ ...style, text: bold ?? underscored ?? "", bold: true });
    else if (italic !== undefined || slanted !== undefined)
      spans.push({ ...style, text: italic ?? slanted ?? "", italic: true });
    else spans.push({ ...style, text: link ?? "", role: "link", underline: true });
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
  !a.inverse === !b.inverse &&
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
        for (let unit of units(piece)) {
          if (used > 0 && used + cellWidth(unit) > width) end();
          while (cellWidth(unit) > width) {
            const [head, rest] = split(unit, width);
            put(from, head);
            end();
            unit = rest;
          }
          put(from, unit);
        }
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

/** Spaces that bring `spans` to `width` cells, as one unstyled span; none when they are wider. */
export const padding = (spans: readonly Span[], width: number): Span[] => {
  const room = width - spansWidth(spans);
  return room > 0 ? [span(" ".repeat(room))] : [];
};

/** What a window's marker says of the rows past its edge: `↓ 3 more`. */
export const moreText = (glyph: string, count: number) => `${glyph} ${count} more`;

export type Scroll = {
  /** Rows the window has, its markers included. */
  rows: number;
  /** Lines scrolled past. Read the one that applies back from `Scrolled.top`. */
  top?: number;
  /** The controls its markers are: each steps the window. Without them they are only read. */
  hits?: { up: string; down: string };
  /** The marker under the pointer: bold, as a control is. */
  hovered?: "up" | "down";
  /** Cells the markers are set in by, to stand under the lines' words. @default 0 */
  inset?: number;
};

export type Scrolled<Row> = {
  rows: Row[];
  /** `top` as it applies: within what there is to scroll. */
  top: number;
  /** The furthest `top` goes. Zero when everything shows. */
  max: number;
};

/**
 * The window of `lines` a room `rows` high shows, from `top`. Where lines are cut off, the
 * window's first or last row says how many, and steps the window when it is a control. A line
 * keeps its row as the window moves from the start.
 */
export function scrolled(lines: readonly Line[], scroll: Scroll): Scrolled<Line> {
  const rows = Math.max(0, Math.floor(scroll.rows));
  const marker = (side: "up" | "down", count: number, hit: string | undefined): Line => {
    const glyph = tokens.glyph.more[side];
    const isHovered = hit !== undefined && scroll.hovered === side;
    return line(
      [
        ...(scroll.inset ? [span(" ".repeat(scroll.inset))] : []),
        span(moreText(glyph, count), {
          role: isHovered ? "text" : "dim",
          bold: isHovered || undefined,
        }),
      ],
      hit,
    );
  };
  if (lines.length <= rows || rows < 1) return { rows: lines.slice(0, rows), top: 0, max: 0 };
  // One row cannot show a line and say there are more: it says how many there are.
  if (rows === 1) return { rows: [marker("down", lines.length, undefined)], top: 0, max: 0 };
  if (rows === 2) {
    // No room for a marker at each edge: one line, and the count of the side with more to it.
    const at = Math.max(0, Math.min(lines.length - 1, Math.floor(scroll.top ?? 0)));
    const shown = lines.slice(at, at + 1);
    const after = lines.length - at - 1;
    return {
      rows: after
        ? [...shown, marker("down", after, scroll.hits?.down)]
        : [marker("up", at, scroll.hits?.up), ...shown],
      top: at,
      max: lines.length - 1,
    };
  }
  // Scrolled as far as it goes, the up marker and the last `rows - 1` lines show.
  const max = lines.length - rows;
  const top = Math.max(0, Math.min(max, Math.floor(scroll.top ?? 0)));
  const from = top > 0 ? top + 1 : 0;
  const room = rows - (top > 0 ? 1 : 0);
  const isCut = from + room < lines.length;
  const to = from + room - (isCut ? 1 : 0);
  return {
    rows: [
      ...(top > 0 ? [marker("up", from, scroll.hits?.up)] : []),
      ...lines.slice(from, to),
      ...(isCut ? [marker("down", lines.length - to, scroll.hits?.down)] : []),
    ],
    top,
    max,
  };
}

/** `top` after a step of `by` lines, for a window that was drawn with `scrolled`. */
export const scrollBy = (window: Pick<Scrolled<unknown>, "top" | "max">, by: number) =>
  Math.max(0, Math.min(window.max, window.top + by));

// ---- type roles and panels on the terminal

/**
 * The style a type role has on a terminal, which has one size: bold for a semibold or bold
 * weight, dim for a role that is dim. What the drawings always did by hand.
 */
export const terminalStyle = (role: TypeRole): Style => {
  const r: { weight: string; role?: Role } = tokens.type[role];
  return { ...(r.role ? { role: r.role } : {}), ...(r.weight !== "regular" ? { bold: true } : {}) };
};

/** A span in a type role. `style` is added to the role's own, such as a hit or an accent. */
export const typed = (role: TypeRole, text: string, style: Style & { hit?: string } = {}): Span =>
  span(text, { ...terminalStyle(role), ...style });

/** Cells a panel's rail and its gap take: a row of a panel starts this far in. */
export const PANEL_INSET = cellWidth(tokens.glyph.rail) + tokens.gutter;

/**
 * What opens in place, set apart as one object: on a terminal, a rail down its left. A row
 * with nothing on it keeps the rail, so the panel reads as one.
 * @param tone The rail's colour role. @default "dim"
 */
export function panelLines(lines: readonly Line[], tone: Role = "dim"): Line[] {
  const rail = span(tokens.glyph.rail, { role: tone });
  const gap = span(" ".repeat(tokens.gutter));
  return lines.map((l) => ({ ...l, spans: l.spans.length ? [rail, gap, ...l.spans] : [rail] }));
}

/** The glyph of a meaning (`priority:high`) in its role: the terminal's form of an icon. */
export const meaningSpan = (name: MeaningName, style: Style & { hit?: string } = {}): Span => {
  const m = meaningOf(name);
  return span(m.glyph, { role: m.role, ...style });
};

/** Markdown's own characters in words that are only words. */
export const escapeMarkdown = (text: string) => text.replace(/([\\`*_{}[\]<>()#+!|~-])/g, "\\$1");

/**
 * Spans as one line of Markdown, for a host that sets a heading with Markdown: plain words are
 * escaped, a code span is inline code, and bold, dim and links are dropped (a heading is bold).
 */
export function markdownOfSpans(list: readonly Span[]): string {
  return list
    .map((s) => {
      const text = s.text.replace(/\s*\n\s*/g, " ");
      if (s.role !== "code") return escapeMarkdown(text);
      // A code span holding backticks is fenced by one more than its longest run.
      const fence = "`".repeat(Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length)) + 1);
      return text.includes("`") ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
    })
    .join("");
}
