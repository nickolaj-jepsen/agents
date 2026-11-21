/**
 * A numbered list of alternatives followed by one question that picks among them ("Which do you
 * want?"), or under a line that is the question ("Want me to:"), is one question whose options are
 * the list, keyed by the numbers it printed.
 */
import type { FormItem } from "../forms.ts";
import { leanedOptions, optionOf } from "./item.ts";
import {
  blockOf,
  dedent,
  type Doc,
  lineAbove,
  ownLines,
  type Split,
  splitClosing,
  unbold,
} from "./lines.ts";
import { isStart, type Start } from "./starts.ts";

// A line that is itself the question a numbered list answers: "Want me to:" 1. 2. 3.
export const MENU_CUE =
  /(?:^|[.!?—–]\s+)((?:want me to|shall i|should i|do you want me to|would you like me to)\b[^?]*):\s*$/i;
// A closing question that picks among the list above it, not one that asks to go ahead.
const CHOOSING =
  /\b(?:which|pick|choose|prefer|go with|start with|one of|both|either|option\s*[0-9]|[0-9]\s*(?:or|\/)\s*[0-9])\b/i;
// What a question that asks for a pick says, as against one that asks to go ahead.
const WHICH = /\b(?:which|pick|choose|prefer)\b/i;

/** The last paragraph after the list when it asks which to take: its words split around the question. */
function choosing(paras: string[][]) {
  const para = paras.at(-1);
  // A paragraph that opens like a numbered item is a list's own, not a closing.
  if (!para || isStart(para[0] ?? "")) return null;
  const text = para.join(" ");
  const said = splitClosing(text);
  // Prose after the question only counts when the question itself asks which, so a closing
  // "…shared understanding? If yes, I'll start with step 1" is no menu.
  const picks = said.ask && (!said.after || WHICH.test(said.ask));
  return picks && CHOOSING.test(`${said.before} ${said.ask}`) ? { said, text } : null;
}

/** The list as options: each item's words and what is under it. `own` is what the last one owns. */
function listed(doc: Doc, run: Start[], own: string[]) {
  const options = run.map((start, i) => {
    const next = run[i + 1];
    const under = next ? blockOf(doc, start.line, next.line).block : own;
    return optionOf(String(start.n), start.title, [start.rest, ...dedent(under)]);
  });
  return { options: options.map((o) => o.option), marked: options.findIndex((o) => o.marked) };
}

export function menuOf(doc: Doc, run: Start[]): Split | null {
  const first = run[0];
  const last = run.at(-1);
  if (!first || !last || run.length < 2) return null;
  const { block, end } = blockOf(doc, last.line);
  const { own, after } = ownLines(block);
  const closing = choosing(after);
  const cue = lineAbove(doc, first.line);
  const cueWords = MENU_CUE.exec(cue.text)?.[1];
  if (!closing && !cueWords) return null;
  const { options, marked } = listed(doc, run, own);
  // The closing paragraph may lean on an option of the list: in the words before its question, or after it.
  const before = closing?.said.before ?? "";
  const picked = leanedOptions(options, { recommended: "", body: closing?.text ?? "" }, marked);
  const leans = Object.keys(picked).length > 0;
  // What the list leaves around it is still the message's words: a block between the options and
  // the closing paragraph, the words before the question when they lean on no option, and what
  // follows the question.
  const item: FormItem = {
    label: "Q1",
    unlabelled: true,
    title: unbold(closing?.said.ask ?? cueWords ?? ""),
    body: [
      ...(closing ? after.slice(0, -1) : after).map((paragraph) => paragraph.join("\n")),
      leans ? "" : unbold(before),
      closing?.said.after ?? "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    options,
    ...picked,
  };
  if (leans && before) item.recommended = unbold(before);
  // The cue is the whole question only when it is a line of its own; else it stays in the head.
  const cueStarts = !closing && cue.text === cueWords;
  return {
    form: { kind: "round", items: [item] },
    starts: [cueStarts ? cue.at : first.line],
    tail: end,
  };
}
