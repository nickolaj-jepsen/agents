/**
 * A round: the labelled questions a message ends on, each with the lines under it. A run of labels
 * is a round only when it asks, which a Q label nearly says by itself and a bare number does not.
 */
import type { FormItem } from "../forms.ts";
import {
  type Doc,
  itemEnd,
  lineAbove,
  linesIn,
  type LabelLine,
  sectionEnd,
  type Split,
  wordsOf,
} from "./doc.ts";
import { readQuestion } from "./question.ts";

// The line above a numbered list that says it holds decisions or questions, so its items are asks.
const DECISION_CUE =
  /\b(?:decisions?\s+(?:for you|to make|needed)|to decide|to confirm|need to know|choose between|questions?\s+(?:for you|before|to answer))\b[^.?!]*:?\s*$/i;

/** The run of labels a message ends on: a run restarts where the numbering goes back. */
export function lastRun(labels: LabelLine[]): LabelLine[] {
  let run: LabelLine[] = [];
  for (const label of labels) {
    if (label.mark.n <= (run.at(-1)?.mark.n ?? 0)) run = [];
    run.push(label);
  }
  return run;
}

/**
 * Where the last item of a run ends. A Q-labelled question runs on to the rule or heading that
 * opens what follows the round, so a closing line stays with it; a numbered list item ends sooner,
 * at its first paragraph that is the message's own again.
 */
export function runEnd(doc: Doc, last: LabelLine): number {
  const end = sectionEnd(doc, last.at);
  return last.mark.q ? end : itemEnd(doc, last.at, end);
}

const signals = (item: FormItem) =>
  item.title.includes("?") || item.options.length > 0 || item.recommended !== undefined;

/**
 * Whether the items are questions. A Q-labelled run needs only the message to end on a question
 * or one item to show a sign; a bare numbered list needs half its items to ask (a `?` anywhere in
 * one counting), or the line above to say it holds questions: a closing "Want me to…?" over a list
 * of done steps is not a round.
 */
function asks(doc: Doc, first: LabelLine, items: FormItem[]): boolean {
  if (first.mark.q) return doc.text.trimEnd().endsWith("?") || items.some(signals);
  const asking = items.filter((item) => signals(item) || item.body.includes("?")).length;
  const above = lineAbove(doc, first.at);
  return (
    (asking > 0 && asking * 2 >= items.length) || (!!above && DECISION_CUE.test(wordsOf(above)))
  );
}

/** A run of labels as a round of questions, or null when it asks nothing. Prose between two items is the earlier one's own. */
export function roundOf(doc: Doc, run: LabelLine[]): Split | null {
  const [first] = run;
  const last = run.at(-1);
  if (!first || !last) return null;
  const tail = runEnd(doc, last);
  const items = run.map((label, i) =>
    readQuestion(label.mark, linesIn(doc, label.at + 1, run[i + 1]?.at ?? tail)),
  );
  return asks(doc, first, items)
    ? { form: { kind: "round", items }, starts: run.map((label) => label.at), tail }
    : null;
}
