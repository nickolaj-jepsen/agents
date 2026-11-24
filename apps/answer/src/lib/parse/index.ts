/**
 * Reading what an agent's last message asks, in three layers:
 *
 * - `doc`: what each line is. Every line is matched once, into a kind and a mark (a label, a
 *   lettered option, a recommendation), and nothing above looks at markup again.
 * - `question`: one question from where it opens and the lines under it: options, recommendation,
 *   body. `lean` knows how a recommendation is worded and which options it names.
 * - the shapes, which only find which lines are questions: `round` (several labelled ones),
 *   `picks` (a pick list) and `single` (one question with no label). `split` below is the order
 *   they are tried in.
 *
 * The three parts of a message, head, items and tail, cover every line: nothing an agent wrote
 * goes unshown. A message is read strictly on purpose: a card on a message that asks nothing, or
 * whose rows are not the answer, costs more than a card never shown, so a shape has to say what it
 * is. A question the reader skips stays answerable in the prompt.
 */
import type { Form } from "../forms.ts";
import { type Doc, isLabel, type LabelLine, readDoc, type Split, tidy } from "./doc.ts";
import { picksOf } from "./picks.ts";
import { lastRun, roundOf } from "./round.ts";
import { bareOf, letteredOf, menuOf } from "./single.ts";

export type { Split };

/**
 * A numbered list, as the first of: a pick list; alternatives under a line that is the question
 * ("Want me to:"); questions; alternatives that a closing question picks from.
 */
function listOf(doc: Doc, run: LabelLine[]): Split | null {
  return (
    picksOf(doc, run) ?? menuOf(doc, run, true) ?? roundOf(doc, run) ?? menuOf(doc, run, false)
  );
}

/** Where a message's lines went, or null when it asks nothing. */
export function split(text: string): Split | null {
  const doc = readDoc(text);
  const labels = doc.lines.filter(isLabel);
  // Q-labelled questions say what they are, so they are read before any numbered list.
  const asked = lastRun(labels.filter((label) => label.mark.q));
  const numbered = lastRun(labels.filter((label) => !label.mark.q));
  return roundOf(doc, asked, numbered) ?? listOf(doc, numbered) ?? letteredOf(doc) ?? bareOf(doc);
}

/** The round or pick list a message ends on, or null when it asks nothing. */
export const parse = (text: string): Form | null => split(text)?.form ?? null;

/** The line each item `parse` finds starts on, so a harness can cut the message up. */
export const startLines = (text: string): number[] => split(text)?.starts ?? [];

/** What the message says after its last item, which no card draws: markdown, "" when none. */
export function tailOf(text: string): string {
  const found = split(text);
  if (!found) return "";
  const lines = readDoc(text).lines.slice(found.tail);
  const from = lines.findIndex((line) => line.kind !== "blank" && line.kind !== "rule");
  return from < 0 ? "" : tidy(lines.slice(from).map((line) => line.raw));
}
