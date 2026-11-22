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

/**
 * The run of labels a message ends on. A run restarts where the numbering goes back or repeats. A
 * label printed with a note, `Q5 (again)`, is a question come back to: it may go back, and
 * restarts the run only when the run already holds its number.
 */
export function lastRun(labels: LabelLine[]): LabelLine[] {
  let run: LabelLine[] = [];
  for (const label of labels) {
    const { n, again } = label.mark;
    const back = !again && n <= (run.at(-1)?.mark.n ?? 0);
    if (back || run.some((held) => held.mark.n === n)) run = [];
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
 * or one item to show a sign. A bare numbered list needs most of its items to ask (a `?` anywhere
 * in one counting), or the line above to say it holds questions: a list that is half instructions
 * or findings is prose, and so is a closing "Want me to…?" over a list of done steps.
 */
function asks(doc: Doc, first: LabelLine, items: FormItem[]): boolean {
  if (first.mark.q) return doc.text.trimEnd().endsWith("?") || items.some(signals);
  const asking = items.filter((item) => signals(item) || item.body.includes("?")).length;
  const above = lineAbove(doc, first.at);
  return asking * 2 > items.length || (!!above && DECISION_CUE.test(wordsOf(above)));
}

/** A run of labels as questions, or null when it asks nothing. Prose between two items is the earlier one's own. */
function read(doc: Doc, run: LabelLine[]): Split | null {
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

/**
 * A run of labels as a round. `under` is a numbered list: when it sits under the round's last
 * question and asks by itself ("Two checks to settle: 1. … 2. …"), its items are questions of
 * their own after it.
 */
export function roundOf(doc: Doc, run: LabelLine[], under: LabelLine[] = []): Split | null {
  const round = read(doc, run);
  const last = run.at(-1);
  const [first] = under;
  const end = under.at(-1);
  if (!round || !last || !first || !end || first.at < last.at) return round;
  // Only a list that is the last thing the question says: one with options or a closing line
  // after it is part of what the question describes.
  if (linesIn(doc, runEnd(doc, end), round.tail).length) return round;
  return (read(doc, under) && read(doc, [...run, ...under])) ?? round;
}
