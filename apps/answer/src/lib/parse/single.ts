/**
 * One question with no label of its own, in the three ways a message asks one:
 *
 * - `letteredOf`: lettered options under a lead-in line;
 * - `menuOf`: a numbered list of alternatives that a closing question picks from ("Which do you
 *   want?"), or that sits under a line that is the question ("Want me to:");
 * - `bareOf`: a question line and a recommendation, with nothing to pick from.
 *
 * Each only finds which lines are the question; `readQuestion` reads them.
 */
import type { FormItem } from "../forms.ts";
import {
  dedent,
  type Doc,
  isLabel,
  isOption,
  itemEnd,
  type Line,
  lineAbove,
  linesIn,
  type LabelLine,
  paragraphs,
  sectionEnd,
  type Split,
  splitClosing,
  textOf,
  unbold,
  wordsOf,
} from "./doc.ts";
import { addOption, type Choices, nextLetter, readQuestion, type Stem } from "./question.ts";

// A line that ends on a question, bold closed or not.
const ASKS = /\?\**\s*$/;
// A lead-in with a style of its own: a bold line. A heading is one too.
const BOLD = /^\*\*/;
// A line that is itself the question a numbered list answers: "Want me to:" 1. 2. 3.
const MENU_CUE =
  /(?:^|[.!?—–]\s+)((?:want me to|shall i|should i|do you want me to|would you like me to)\b[^?]*):\s*$/i;
// A closing question that picks among the list above it, not one that asks to go ahead.
const CHOOSING =
  /\b(?:which|pick|choose|prefer|go with|start with|one of|both|either|option\s*[0-9]|[0-9]\s*(?:or|\/)\s*[0-9])\b/i;
// What a question that asks for a pick says, as against one that asks to go ahead.
const WHICH = /\b(?:which|pick|choose|prefer)\b/i;
// The closer of a grilling is answered with a plain "yes"; it gets no card.
const CLOSER = /shared understanding/i;

const OPTION_REACH = 8; // how far below an option its next letter may be
const LEAD_REACH = 6; // how many lines above its options or its recommendation a lead-in may be
const LONG_LINE = 160; // a longer lead-in is cut to its bold or its first sentence

/** A card for one question: the reply to it is the answer alone, so it prints no label. */
function single(item: FormItem, start: number, tail: number): Split {
  return { form: { kind: "round", items: [{ ...item, unlabelled: true }] }, starts: [start], tail };
}

/** The paragraph some lines close on, when it asks: its words around the question, and the lines before it. */
function closingOf(lines: Line[]) {
  const last = paragraphs(lines).at(-1);
  // A paragraph that opens like an option or a numbered item is a list's own, not a closing.
  if (!last?.[0] || isOption(last[0]) || isLabel(last[0])) return null;
  const said = splitClosing(last.map((line) => line.raw).join(" "));
  return said.ask ? { ...said, kept: lines.filter((line) => line.at < (last[0]?.at ?? 0)) } : null;
}

/**
 * The lead-in as a stem. A long line leads with its bold or its first sentence, and the rest is
 * the question's body.
 */
function leadIn(line: Line): Stem {
  const lead = textOf(line);
  const cut =
    /^\*\*(.+?)\*\*\s*(.*)$/.exec(lead) ??
    new RegExp(`^(.{20,${LONG_LINE}}?[.!?])\\s+(.*)$`).exec(lead);
  const [head = "", rest = ""] =
    lead.length <= LONG_LINE
      ? [lead]
      : cut
        ? cut.slice(1)
        : [lead.slice(0, LONG_LINE), lead.slice(LONG_LINE)];
  // A bare "Q." label with no number is not part of the title.
  const title = unbold(head.replace(/:\s*$/, "")).replace(/^Q\s*[.:)]\s+/, "");
  return { label: "Q1", title, rest };
}

/**
 * The lines that say something above `at`, nearest first and six at most. A rule ends the climb,
 * and so does a heading, which is the top of its part of the message.
 */
function linesAbove(doc: Doc, at: number): Line[] {
  const said: Line[] = [];
  for (
    let up = doc.lines[at - 1];
    up && up.kind !== "rule" && said.length < LEAD_REACH;
    up = doc.lines[up.at - 1]
  ) {
    if (up.kind === "text" || up.kind === "heading") said.push(up);
    if (up.kind === "heading") break;
  }
  return said;
}

const asking = (lines: Line[]) => lines.find((line) => ASKS.test(line.raw));

/**
 * One question over lettered options. A lead-in that is a heading, bold or itself a question is the
 * title, and a closing question stays under it; a plain one gives way to the closing question,
 * which is what the reader answers, and stays in the message's head. The options ask when the
 * message closes on a question or leans on one of them.
 */
export function letteredOf(doc: Doc): Split | null {
  // A lone "A." is a sentence: an option needs its next letter a few lines below.
  const first = doc.lines.find(
    (line, at) =>
      isOption(line) &&
      doc.lines
        .slice(at + 1, at + 1 + OPTION_REACH)
        .some((next) => isOption(next) && next.mark.key === nextLetter(line.mark.key)),
  );
  if (!first) return null;
  const above = linesAbove(doc, first.at);
  const lead = asking(above) ?? above[0];
  const stem = lead && leadIn(lead);
  if (!lead || !stem?.title || CLOSER.test(stem.title)) return null;
  const tail = sectionEnd(doc, lead.at);
  const styled = lead.kind === "heading" || BOLD.test(lead.raw) || ASKS.test(lead.raw);
  const closing = styled ? null : closingOf(linesIn(doc, first.at, tail));
  const item = closing
    ? readQuestion({ label: "Q1", title: unbold(closing.ask), rest: "" }, closing.kept, [
        closing.before,
        closing.after,
      ])
    : readQuestion(stem, linesIn(doc, lead.at + 1, tail));
  const leans = item.recommended !== undefined || item.recommendedOption !== undefined;
  const closes = (paragraphs(doc.lines).at(-1) ?? []).some((line) => line.raw.includes("?"));
  const asked = item.options.length ? closing !== null || closes || leans : leans;
  return asked ? single(item, closing ? first.at : lead.at, tail) : null;
}

/**
 * One question and its recommendation, with nothing to pick from. The recommendation is what says
 * the line above it is put to the reader, so a bare "Want me to push?" stays prose.
 */
export function bareOf(doc: Doc): Split | null {
  const lean = doc.lines.find((line) => line.mark?.is === "lean");
  if (!lean) return null;
  // The question is within six lines of it, blank or not: one further up is not what it answers.
  const near = linesAbove(doc, lean.at).filter((line) => lean.at - line.at <= LEAD_REACH);
  const lead = asking(near);
  const stem = lead && leadIn(lead);
  if (!lead || !stem?.title || CLOSER.test(stem.title)) return null;
  const tail = sectionEnd(doc, lead.at);
  const item = readQuestion(stem, linesIn(doc, lead.at + 1, tail));
  return item.recommended === undefined ? null : single(item, lead.at, tail);
}

/** A numbered list as options, keyed by its numbers: each item's words, and what is under it as its detail. */
function listed(doc: Doc, run: LabelLine[], end: number): Choices {
  const choices: Choices = { options: [], marked: -1 };
  for (const [i, { at, mark }] of run.entries())
    addOption(choices, String(mark.n), mark.title, [
      mark.rest,
      ...dedent(linesIn(doc, at + 1, run[i + 1]?.at ?? end)),
    ]);
  return choices;
}

/**
 * A numbered list of alternatives as one question. `cued` reads only a list under a line that is
 * itself the question, which makes the list its options before any item is read as a question of
 * its own; otherwise the paragraph after the list must close on a question that picks among them.
 */
export function menuOf(doc: Doc, run: LabelLine[], cued: boolean): Split | null {
  const [first] = run;
  const last = run.at(-1);
  if (!first || !last || run.length < 2) return null;
  const tail = sectionEnd(doc, last.at);
  const listEnd = itemEnd(doc, last.at, tail);
  const lead = lineAbove(doc, first.at);
  const cue = lead && MENU_CUE.exec(wordsOf(lead))?.[1];
  const after = linesIn(doc, listEnd, tail);
  const closing = closingOf(after);
  // The question picks from the list nearest above it: lettered options after the numbers are
  // what it asks about. Prose after the question only counts when the question itself asks which,
  // so a closing "…shared understanding? If yes, I'll start with step 1" is no menu.
  const picking =
    closing &&
    after.filter(isOption).length < 2 &&
    (!closing.after || WHICH.test(closing.ask)) &&
    CHOOSING.test(`${closing.before} ${closing.ask}`)
      ? closing
      : null;
  if (cued ? !cue : !picking) return null;
  const item = readQuestion(
    { label: "Q1", title: unbold(picking?.ask ?? cue ?? ""), rest: "" },
    picking?.kept ?? after,
    picking ? [picking.before, picking.after] : [],
    listed(doc, run, listEnd),
  );
  // The cue is the whole question only when it is a line of its own; else it stays in the head.
  const start = !picking && lead && wordsOf(lead) === cue ? lead.at : first.at;
  return single(item, start, tail);
}
