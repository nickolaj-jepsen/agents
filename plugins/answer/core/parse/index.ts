/**
 * Reading what an agent's last message asks. `split` is the entry, and it tries two things:
 *
 * - the runs of numbered or Q-labelled starts (`starts`), best first, each through `runs`, which
 *   reads a run as a pick list (`picks`), a menu of alternatives with one question (`menu`), or a
 *   round of questions;
 * - failing that, one lettered question with no number (`lone`).
 *
 * A round's questions, and the lone one, are read by `item`: options, recommendation, body. `lean`
 * knows how a recommendation reads and which options it names; `lines` is what they all share.
 *
 * The three parts of a message, head, items and tail, cover every line: nothing an agent wrote
 * goes unshown. Parsing is lenient on purpose: a false positive costs a hint the person ignores.
 */
import type { Form } from "../forms.ts";
import { type Split, RULE, readDoc, tidy } from "./lines.ts";
import { loneOf } from "./lone.ts";
import { runOf } from "./runs.ts";
import { candidates, findStarts } from "./starts.ts";

export type { Split };

/** Where a message's lines went, or null when it asks nothing. */
export function split(text: string): Split | null {
  const doc = readDoc(text);
  for (const run of candidates(findStarts(doc))) {
    const found = runOf(doc, run);
    if (found) return found;
  }
  return loneOf(doc);
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
  while (lines.length && (!lines[0]?.trim() || RULE.test(lines[0] ?? ""))) lines.shift();
  return tidy(lines);
}
