/** What every reader shares: a message as lines, and the small things done to lines. Nothing here knows what a question is. */
import type { Form } from "../forms.ts";

/** A message as lines, and which of them are code: a fence and what it holds, which is never the message's own format. */
export type Doc = { text: string; lines: string[]; code: boolean[] };

/**
 * Where a message's lines went: the form it asks, the line each item starts on, and the line
 * the tail starts on. The lines before the first start are the head, each item owns the lines to
 * the next start, and the tail is what follows the last one, so the three cover every line.
 */
export type Split = { form: Form; starts: number[]; tail: number };

const FENCE = /^\s*(```|~~~)/;
export const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING = /^#{1,6}\s/;

export function readDoc(text: string): Doc {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let inFence = false;
  const code = lines.map((line) => {
    if (FENCE.test(line)) inFence = !inFence;
    return inFence || FENCE.test(line);
  });
  return { text, lines, code };
}

export const indent = (line: string) => line.length - line.trimStart().length;

export const unbold = (text: string) => text.replaceAll("**", "").trim();

/** Lines as markdown: blank runs made one, the ends trimmed. */
export const tidy = (lines: string[]) =>
  lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * The lines an item owns after its start: up to the `following` line, or for the last item up to
 * the rule or heading that starts what follows the round. Prose between items is the item's own,
 * so none goes unshown; only the rules that separate are dropped. `end` is the first line not read.
 */
export function blockOf(
  doc: Doc,
  line: number,
  following?: number,
): { block: string[]; end: number } {
  let end = following ?? doc.lines.length;
  const ends = (i: number) =>
    !doc.code[i] && (RULE.test(doc.lines[i] ?? "") || HEADING.test(doc.lines[i] ?? ""));
  if (following === undefined) {
    const stop = doc.lines.findIndex((_, i) => i > line && ends(i));
    if (stop >= 0) end = stop;
  }
  const block = doc.lines.slice(line + 1, end);
  while (block.length && (!block.at(-1)?.trim() || RULE.test(block.at(-1) ?? ""))) block.pop();
  return { block, end };
}

/** The nearest line that says something within three lines above `line`, markup off, and where it was. */
export function lineAbove(doc: Doc, line: number): { text: string; at: number } {
  for (let i = line - 1; i >= Math.max(0, line - 3); i--) {
    const text = (doc.lines[i] ?? "").replace(/^#{1,6}\s+/, "").trim();
    if (text) return { text: unbold(text), at: i };
  }
  return { text: "", at: -1 };
}

/** Lines with the indentation they all share taken off, and blank lines made empty. */
export function dedent(block: string[]): string[] {
  const shared = Math.min(...block.filter((line) => line.trim()).map(indent), Infinity);
  return block.map((line) => (line.trim() ? line.slice(Number.isFinite(shared) ? shared : 0) : ""));
}

/** The paragraphs of some lines, split where a line is blank. */
export function paragraphs(lines: string[]): string[][] {
  const out: string[][] = [];
  let open: string[] = [];
  for (const line of lines) {
    if (line.trim()) open.push(line);
    else if (open.length) out.push(open.splice(0));
  }
  if (open.length) out.push(open);
  return out;
}

/** Where a block's first unindented paragraph after a blank line starts, -1 for none. */
function paragraphBreak(block: string[]): number {
  for (let i = 1; i < block.length; i++)
    if (!(block[i - 1] ?? "").trim() && (block[i] ?? "").trim() && indent(block[i] ?? "") === 0)
      return i;
  return -1;
}

/**
 * What a last block owns, and the paragraphs after it. A block that is the last of a list ends at
 * its first unindented paragraph after a blank line; what follows is the message's own, and `cut`
 * is the line it starts on (0 when there is none).
 */
export function ownLines(block: string[]) {
  const cut = paragraphBreak(block);
  return cut > 0
    ? { own: block.slice(0, cut), after: paragraphs(block.slice(cut)), cut }
    : { own: block, after: [], cut: 0 };
}

/** A paragraph as what comes before its last question (a lean, often), the question, and what follows it. */
export function splitClosing(paragraph: string): { before: string; ask: string; after: string } {
  const sentences = paragraph.trim().split(/(?<=[.!?])\s+/);
  let ask = sentences.length - 1;
  while (ask >= 0 && !sentences[ask]?.endsWith("?")) ask--;
  if (ask < 0) return { before: paragraph.trim(), ask: "", after: "" };
  return {
    before: sentences.slice(0, ask).join(" "),
    ask: sentences[ask] ?? "",
    after: sentences.slice(ask + 1).join(" "),
  };
}
