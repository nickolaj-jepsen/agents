/**
 * What each line of a message is. Every pattern that recognises how a line is written lives here
 * and runs once per line: the readers ask a line for its mark and never match its markup again.
 * Nothing here knows what a question is.
 */
import type { Form } from "../forms.ts";

/** `**Q1. …**`, `### Q2: …`, `1. …`, `**3.** …`: the label of a question, or the number of a list item. */
export type Label = {
  is: "label";
  /** Said to be a question: `Q1`, `Question 2`. */
  q: boolean;
  n: number;
  /** As a reply names it: `Q3`, `2`. */
  label: string;
  /** Printed with a note, `Q5 (again)`: a question come back to, which may be out of order. */
  again: boolean;
  title: string;
  /** What the line said after its title. */
  rest: string;
};

/** `- **A.** …`, `B) …`, `(c) …`: a lettered option. */
export type Lettered = {
  is: "option";
  /** Upper case. */
  key: string;
  text: string;
  /** What the line said after a bold title. */
  more: string;
  /** Written as a list item, so a bullet under it is the next item and not its detail. */
  bullet: boolean;
};

/** `> **Recommended:** …`, `My recommendation: …`, `➡️ …`: the words of a recommendation. */
export type Lean = { is: "lean"; text: string };

/** What a line opens with, when a reader cares. A bullet is a list item that is none of the others. */
export type Mark = Label | Lettered | Lean | { is: "bullet" };

export type Line = {
  /** Its index in the message. */
  at: number;
  raw: string;
  indent: number;
  /** `code` is a fence and what it holds, which is never the message's own format. */
  kind: "blank" | "code" | "rule" | "heading" | "text";
  /** Quoted with `>`. */
  quoted: boolean;
  mark?: Mark;
};

/** A line that opens with a label, and one that opens with a lettered option. */
export type LabelLine = Line & { mark: Label };
export type OptionLine = Line & { mark: Lettered };

export type Doc = { text: string; lines: Line[] };

/**
 * Where a message's lines went: the form it asks, the line each item starts on, and the line
 * the tail starts on. The lines before the first start are the head, each item owns the lines to
 * the next start, and the tail is what follows the last one, so the three cover every line.
 */
export type Split = { form: Form; starts: number[]; tail: number };

// A fence opens with three or more of one mark; group 2 is what its line says after them.
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING = /^#{1,6}\s+/;
const BULLET = /^[-*+]\s+/;
const QUOTE = /^>\s*/;

// `**Q1. …**`, `### Q2: …`, `Q4) …`, `## Question 5: …`, `## Q6 — …`, `❓ **Q1** - **Title**: …`,
// `**Q7 (revised). …**`. At most three digits, so a year or a count is no label. Group 1 opens a
// bold before the label, 3 is a note on it, and 4 and 5 close the bold, before or after the
// label's punctuation.
const Q_LABEL =
  /^(?:❓\s*)?(\*\*)?Q(?:uestion)?\s*(\d{1,3})(\s*\([^)]*\))?(\*\*)?(?:[.:)]|\s*[—–-](?=\s))(\*\*)?\s+(.+)$/;
// `1. …`, `**3.** …`, `### 2. **…**`, `4) …`: a dash never follows a bare number.
const N_LABEL = /^(\*\*)?(\d{1,3})[.:)](\*\*)?\s+(.+)$/;
// `- **A.** …`, `- **A. …**`, `A) …`, `**B.** …`, `(c) …`, `- **(a)** …`; the letter may be lower case.
// `- **A.**` alone has its words on the lines under it.
const OPTION = /^(\*\*)?\(?([A-Ha-h])[.)](\*\*)?(?:\s+(.+))?$/;
// `Recommended: A. …`, `**My recommendation:** …`, `My recommended answer: …`, `➡️ …`: group 1 is
// what follows the label.
const LEAN = /^\**(?:(?:My )?recommend(?:ed|ation)(?: answer)?\**\s*:\s*\**|➡️)\s*(.*)$/i;
// `My recommendation is …` has no colon and reads as a sentence, so it keeps its label.
const LEAN_SENTENCE = /^\**(?:My )?recommend(?:ed|ation)(?: answer)?\**\s+is\s/i;

export const unbold = (text: string) => text.replaceAll("**", "").trim();

/**
 * `**Title.** more words`: the bold a line leads with is its title and the rest follows, without
 * the comma or colon that joined it on. `open` when a bold opened before the label and is still
 * open. A line that leads with no bold is all title: `**A.** More **words**` stays whole.
 */
function titled(words: string, open: boolean): { title: string; rest: string } {
  const lead = open ? words : words.startsWith("**") ? words.slice(2) : undefined;
  const close = lead?.indexOf("**") ?? -1;
  if (lead === undefined || close < 0) return { title: words.trim(), rest: "" };
  const rest = lead.slice(close + 2).replace(/^\s*[,;:–—]\s*/, "");
  return { title: lead.slice(0, close).trim(), rest: rest.trim() };
}

/** A label is unindented: a number under a list item is that item's own. */
function labelOf(line: string): Label | undefined {
  const words = line.replace(HEADING, "");
  const asked = Q_LABEL.exec(words);
  const [open, n = "", shut, after = ""] = asked
    ? [asked[1], asked[2], asked[4] ?? asked[5], asked[6]]
    : (N_LABEL.exec(words)?.slice(1) ?? []);
  const { title, rest } = titled(after, Boolean(open) && !shut);
  if (!unbold(title)) return undefined;
  return {
    is: "label",
    q: Boolean(asked),
    n: Number(n),
    label: asked ? `Q${n}` : n,
    again: Boolean(asked?.[3]),
    title: unbold(title),
    rest,
  };
}

function optionOf(item: string, bullet: boolean): Lettered | undefined {
  const [, open, letter, shut, after = ""] = OPTION.exec(item) ?? [];
  if (!letter) return undefined;
  const { title, rest } = titled(after, Boolean(open) && !shut);
  return { is: "option", key: letter.toUpperCase(), text: title, more: rest, bullet };
}

function leanOf(words: string): Lean | undefined {
  const said = words.replace(QUOTE, "");
  const text = LEAN.exec(said)?.[1] ?? (LEAN_SENTENCE.test(said) ? said : undefined);
  return text === undefined ? undefined : { is: "lean", text };
}

/** A line's mark: a label first, then an option, and a recommendation only on a line that is no list item. */
function markOf(raw: string, indent: number): Mark | undefined {
  const words = raw.trim();
  const item = words.replace(BULLET, "");
  const bullet = item !== words;
  return (
    (indent === 0 ? labelOf(words) : undefined) ??
    optionOf(item, bullet) ??
    (bullet ? { is: "bullet" } : leanOf(words))
  );
}

/**
 * Whether each line is code. A fence closes on a line of at least as many of its own marks and
 * nothing else, so a fence quoted inside a longer one does not end it.
 */
function codeLines(lines: string[]): boolean[] {
  let open = "";
  return lines.map((line) => {
    const [, marks = "", said = ""] = FENCE.exec(line) ?? [];
    const isCode = open !== "" || marks !== "";
    if (open && marks.startsWith(open) && !said.trim()) open = "";
    else if (!open) open = marks;
    return isCode;
  });
}

export function readDoc(text: string): Doc {
  const raws = text.replace(/\r\n?/g, "\n").split("\n");
  const code = codeLines(raws);
  const lines = raws.map((raw, at): Line => {
    const indent = raw.length - raw.trimStart().length;
    const quoted = raw.trimStart().startsWith(">");
    if (code[at]) return { at, raw, indent, quoted, kind: "code" };
    if (!raw.trim()) return { at, raw, indent, quoted, kind: "blank" };
    if (RULE.test(raw)) return { at, raw, indent, quoted, kind: "rule" };
    const kind = HEADING.test(raw) ? "heading" : "text";
    return { at, raw, indent, quoted, kind, mark: markOf(raw, indent) };
  });
  return { text, lines };
}

export const isLabel = (line: Line | undefined): line is LabelLine => line?.mark?.is === "label";
export const isOption = (line: Line | undefined): line is OptionLine => line?.mark?.is === "option";

/** What a line says after the marks that open it: a quote mark, heading marks, a list marker. */
export const textOf = (line: Line) =>
  line.raw.trim().replace(QUOTE, "").replace(HEADING, "").replace(BULLET, "");

/** What a line says, with its bold taken off too. */
export const wordsOf = (line: Line) => unbold(textOf(line));

/** Lines as markdown: blank runs made one, the ends trimmed. */
export const tidy = (lines: string[]) =>
  lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Lines with the indentation they all share taken off, and blank lines made empty. */
export function dedent(lines: Line[]): string[] {
  const shared = Math.min(...lines.filter((line) => line.kind !== "blank").map((l) => l.indent));
  return lines.map((line) => (line.kind === "blank" ? "" : line.raw.slice(shared)));
}

/** The paragraphs of some lines, split where a line is blank. */
export function paragraphs(lines: Line[]): Line[][] {
  const out: Line[][] = [];
  let open: Line[] = [];
  for (const line of lines) {
    if (line.kind !== "blank") open.push(line);
    else if (open.length) out.push(open.splice(0));
  }
  if (open.length) out.push(open);
  return out;
}

/**
 * Where the part of the message that starts on line `from` ends: the next rule or heading, which
 * opens what follows the questions, or the end of the message.
 */
export function sectionEnd(doc: Doc, from: number): number {
  const next = doc.lines.find(
    (line) => line.at > from && (line.kind === "rule" || line.kind === "heading"),
  );
  return next?.at ?? doc.lines.length;
}

/**
 * Where the list item on line `from` ends, looking no further than `end`: at its first unindented
 * paragraph after a blank line, which is the message's own again.
 */
export function itemEnd(doc: Doc, from: number, end: number): number {
  for (let at = from + 1; at < end; at++) {
    const line = doc.lines[at];
    if (doc.lines[at - 1]?.kind === "blank" && line?.kind !== "blank" && line?.indent === 0)
      return at;
  }
  return end;
}

/** Lines `from` to `end`, without the blank lines and rules that only close them off. */
export function linesIn(doc: Doc, from: number, end: number): Line[] {
  const lines = doc.lines.slice(from, end);
  while (lines.at(-1)?.kind === "blank" || lines.at(-1)?.kind === "rule") lines.pop();
  return lines;
}

/** The nearest line that says something within three lines above `at`. */
export function lineAbove(doc: Doc, at: number): Line | undefined {
  for (let up = at - 1; up >= Math.max(0, at - 3); up--) {
    const line = doc.lines[up];
    if (line && wordsOf(line)) return line;
  }
  return undefined;
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
