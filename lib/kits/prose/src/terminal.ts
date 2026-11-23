/**
 * Prose as styled lines: the one drawing both terminals paint. A text of several blocks is set
 * here, not by each host's Markdown renderer, wherever its rows have to be counted: in a room
 * that shows a window of it and scrolls. A host's own renderer (a `slot` line) still draws what
 * needs syntax colours or runs as long as it likes.
 */
import {
  blank,
  block,
  cellWidth,
  inline,
  line,
  span,
  truncate,
  type Line,
  type Span,
  type Style,
} from "@agents/kit-core/lines.ts";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { ProseTerminal } from "./contract.ts";

const GAP = " ".repeat(tokens.gutter);

const ITEM = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const ROW = /^\s*\|.*\|\s*$/;
const DIVIDER = /^:?-{2,}:?$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;

/** A table row's cells. */
const cellsOf = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

/**
 * A table to `width` cells: columns two apart, each as wide as its widest cell while they fit
 * and sharing the room in proportion when they do not, cells wrapped, the first row bold.
 */
function table(rows: string[], width: number, base: Style): Line[] {
  const all = rows.map(cellsOf).filter((cells) => !cells.every((cell) => DIVIDER.test(cell)));
  const count = Math.max(0, ...all.map((cells) => cells.length));
  if (!count) return [];
  const plain = (cell: string) => inline(cell).reduce((n, s) => n + cellWidth(s.text), 0);
  const natural = Array.from({ length: count }, (_, i) =>
    Math.max(1, ...all.map((cells) => plain(cells[i] ?? ""))),
  );
  const room = Math.max(count, width - (count - 1) * tokens.gutter);
  const total = natural.reduce((n, w) => n + w, 0);
  const widths = natural.map((w) =>
    total <= room ? w : Math.max(1, Math.floor((room * w) / total)),
  );
  return all.flatMap((cells, r) => {
    const style: Style = r === 0 ? { ...base, role: base.role ?? "text", bold: true } : base;
    const columns = widths.map((w, i) => block(inline(cells[i] ?? "", style), w));
    const height = Math.max(1, ...columns.map((column) => column.length));
    return Array.from({ length: height }, (_, y) => {
      const spans: Span[] = [];
      columns.forEach((column, i) => {
        const cell = column[y]?.spans ?? [];
        const used = cell.reduce((n, s) => n + cellWidth(s.text), 0);
        const isLast = i === columns.length - 1;
        spans.push(...cell);
        if (!isLast) spans.push(span(" ".repeat(Math.max(0, (widths[i] ?? 0) - used)) + GAP));
      });
      return line(spans);
    });
  });
}

/**
 * Markdown's blocks as lines of `width` cells: paragraphs, lists (bulleted, numbered, ticked,
 * nested), headings, quotes, rules, fenced code and tables, with inline Markdown in each. One
 * blank row between blocks, none between the items of a list or the lines of a paragraph.
 */
export function prose({ text, width, isDim = false }: ProseTerminal): Line[] {
  const base: Style = isDim ? { role: "dim" } : {};
  const quiet: Style = { role: "dim" };
  const out: Line[] = [];
  /** A blank row before a block, unless it follows one or starts the text. */
  const gap = () => {
    const last = out[out.length - 1];
    if (last && (last.spans.length || last.slot)) out.push(blank());
  };
  const rows = text.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let wasItem = false;
  const flush = () => {
    if (!paragraph.length) return;
    gap();
    // A line end inside a paragraph is kept, as Linear and GitHub keep it in what they render.
    for (const words of paragraph) out.push(...block(inline(words, base), width));
    paragraph = [];
  };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? "";
    const fence = FENCE.exec(row);
    if (fence) {
      flush();
      gap();
      const code: string[] = [];
      for (i++; i < rows.length && !(rows[i] ?? "").trim().startsWith(fence[1] ?? "```"); i++)
        code.push(rows[i] ?? "");
      // Code is not wrapped: a line that does not fit is cut, so its columns stay columns.
      for (const l of code)
        out.push(line([span(GAP), span(truncate(l, width - tokens.gutter), { role: "code" })]));
      wasItem = false;
      continue;
    }
    if (ROW.test(row)) {
      flush();
      gap();
      const from = i;
      while (i + 1 < rows.length && ROW.test(rows[i + 1] ?? "")) i++;
      out.push(...table(rows.slice(from, i + 1), width, base));
      wasItem = false;
      continue;
    }
    if (!row.trim()) {
      flush();
      wasItem = false;
      continue;
    }
    if (RULE.test(row)) {
      flush();
      gap();
      out.push(line([span(tokens.glyph.rule.repeat(width), { role: "border" })]));
      wasItem = false;
      continue;
    }
    const heading = /^\s*#{1,6}\s+(.*?)\s*#*\s*$/.exec(row);
    if (heading) {
      flush();
      gap();
      out.push(
        ...block(
          inline(heading[1] ?? "", { ...base, role: base.role ?? "text", bold: true }),
          width,
        ),
      );
      wasItem = false;
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(row);
    if (quote) {
      flush();
      const lead = [span(tokens.glyph.rail, quiet), span(" ")];
      if (!wasItem) gap();
      out.push(...block(inline(quote[1] ?? "", quiet), width, { lead, hang: lead }));
      wasItem = true;
      continue;
    }
    const item = ITEM.exec(row);
    if (item) {
      flush();
      // The items of one list stand together; a list after a paragraph is set apart.
      if (!wasItem) gap();
      const [, indent = "", , number, tick, words = ""] = item;
      // Lines indented under an item carry on its words.
      let rest = words;
      while (
        i + 1 < rows.length &&
        /^\s+\S/.test(rows[i + 1] ?? "") &&
        !ITEM.test(rows[i + 1] ?? "") &&
        !FENCE.test(rows[i + 1] ?? "")
      )
        rest += ` ${(rows[++i] ?? "").trim()}`;
      const depth = Math.min(3, Math.floor(indent.replace(/\t/g, "  ").length / 2));
      // A ticked item keeps Markdown's own brackets: a filled square would read as a choice.
      const mark =
        tick !== undefined
          ? span(tick === " " ? "[ ]" : "[x]", tick === " " ? quiet : { role: "success" })
          : span(number ? `${number}.` : tokens.glyph.bullet, quiet);
      out.push(
        ...block(inline(rest, base), width, {
          lead: [span(" ".repeat(depth * tokens.gutter)), mark, span(" ")],
        }),
      );
      wasItem = true;
      continue;
    }
    // A line under a list that is not indented starts a paragraph of its own.
    wasItem = false;
    paragraph.push(row.trim());
  }
  flush();
  while (out.length && !out[out.length - 1]?.spans.length) out.pop();
  return out;
}
