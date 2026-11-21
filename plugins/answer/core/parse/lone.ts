/**
 * One question with no number: a block of lettered options under a lead-in line, closed by a
 * question or carrying a recommendation; or a question line followed by a recommendation line.
 * The option-less shape asks for the recommendation, so a bare "Want me to push?" stays prose.
 */
import { type Lead, letterOf, nextLetter, readItem } from "./item.ts";
import { RECOMMENDED } from "./lean.ts";
import { blockOf, type Doc, paragraphs, type Split, splitClosing, unbold } from "./lines.ts";

// A line that ends on a question, bold closed or not.
const ASKS = /\?\**\s*$/;
// How far from its anchor a lone question's other lines may be.
const OPTION_REACH = 8; // a lettered option's next letter, below it
const LEAD_REACH = 6; // the lead-in, above the options or the Recommended line
const LONG_LINE = 160; // a lead-in line longer than this is cut to its bold or its first sentence
// What a lead-in with a style of its own looks like: a heading or a bold line.
const STYLED = /^(?:#{1,6}\s|\*\*)/;

/**
 * Where the question hangs from: the first option whose next letter follows within a few lines (a
 * lone "A." is a sentence), else the Recommended line, which needs a line above it to be the question.
 */
function anchorOf(lines: string[]): { line: number; lettered: boolean } | null {
  const line = lines.findIndex((text, n) => {
    const letter = letterOf(text);
    const below = lines.slice(n + 1, n + 1 + OPTION_REACH);
    return letter !== "" && below.some((next) => letterOf(next) === nextLetter(letter));
  });
  if (line >= 0) return { line, lettered: true };
  const recommended = lines.findIndex((text) => RECOMMENDED.test(text));
  return recommended > 0 ? { line: recommended, lettered: false } : null;
}

/**
 * The lead-in line: the nearest line above that asks, else (above options) the nearest at all.
 * Above options it is one of six lines that say something; above a bare Recommended line it is
 * one of the six lines before it, blank or not, so a heading far up is no question put to the reader.
 */
function leadInAbove(lines: string[], from: number, lettered: boolean): number | undefined {
  const above: number[] = [];
  for (
    let up = from - 1;
    up >= 0 && (lettered ? above.length < LEAD_REACH : up >= from - LEAD_REACH);
    up--
  )
    if (lines[up]?.trim()) above.push(up);
  const asking = above.find((n) => ASKS.test(lines[n] ?? ""));
  return asking ?? (lettered ? above[0] : undefined);
}

/** A long lead-in line leads with its bold or its first sentence; the rest is the question's body. */
function headline(line: string): Lead {
  const lead = line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .trim();
  const bold = /^\*\*(.+?)\*\*\s*(.*)$/.exec(lead);
  const sentence = new RegExp(`^(.{20,${LONG_LINE}}?[.!?])\\s+(.*)$`).exec(lead);
  const cut = bold ?? sentence;
  const [head, rest] =
    lead.length <= LONG_LINE
      ? [lead, ""]
      : cut
        ? [cut[1] ?? "", cut[2] ?? ""]
        : [lead.slice(0, LONG_LINE), lead.slice(LONG_LINE)];
  // A bare "Q." label with no number is not part of the title.
  const title = unbold(head.replace(/:\s*$/, "")).replace(/^Q\s*[.:)]\s+/, "");
  return { label: "Q1", title, rest };
}

/**
 * A plain lead-in (no heading, bold or question) gives way to the closing ask: the question the
 * reader answers is the title, and the lead-in stays in the message's head. The item starts on
 * its first option, with the closing paragraph's lean and what follows its ask under it.
 */
function closingAsk(doc: Doc, optionLine: number) {
  // The block starts on the option line itself: `blockOf` reads the lines after the one it is given.
  const { block, end } = blockOf(doc, optionLine - 1);
  const paras = paragraphs(block);
  const closing = paras.at(-1);
  const said = closing && paras.length > 1 ? splitClosing(closing.join(" ")) : null;
  if (!closing || !said?.ask) return null;
  const kept = block.slice(0, block.length - closing.length);
  const rest = [...(said.before ? [said.before, ""] : []), ...(said.after ? [said.after] : [])];
  return {
    line: optionLine,
    lead: { label: "Q1", title: unbold(said.ask), rest: "" },
    block: [...kept, ...rest],
    end,
  };
}

export function loneOf(doc: Doc): Split | null {
  const lines = doc.lines.map((line, i) => (doc.code[i] ? "" : line));
  const anchor = anchorOf(lines);
  const leadAt = anchor ? leadInAbove(lines, anchor.line, anchor.lettered) : undefined;
  if (!anchor || leadAt === undefined) return null;
  const lead = headline(lines[leadAt] ?? "");
  // The closer of a grilling is answered with a plain "yes"; it gets no card.
  if (!lead.title || /shared understanding/i.test(lead.title)) return null;
  const raw = (lines[leadAt] ?? "").trim();
  const plain = anchor.lettered && !STYLED.test(raw) && !ASKS.test(raw);
  const closing = plain ? closingAsk(doc, anchor.line) : null;
  const { block, end } = blockOf(doc, leadAt);
  const chosen = closing ?? { line: leadAt, lead, block, end };
  const item = readItem(chosen.lead, chosen.block);
  item.unlabelled = true;
  const leans = item.recommended !== undefined || item.recommendedOption !== undefined;
  const lastWords = paragraphs(doc.lines).at(-1)?.join(" ") ?? "";
  // A lettered block asks when its closing ask is the title, the message ends on a question, or it leans.
  const asked =
    item.options.length >= 2 ? closing !== null || lastWords.includes("?") || leans : leans;
  return asked
    ? { form: { kind: "round", items: [item] }, starts: [chosen.line], tail: chosen.end }
    : null;
}
