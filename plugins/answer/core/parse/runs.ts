/**
 * Reading a run of numbered or Q-labelled starts: most messages with a question in them come here.
 * `runOf` tries, in order, a pick list, a menu whose question is the line above the list, a round
 * of questions (when the run asks), and last a menu of alternatives with one question after the list.
 */
import type { FormItem } from "../forms.ts";
import { readItem } from "./item.ts";
import { blockOf, type Doc, lineAbove, ownLines, type Split } from "./lines.ts";
import { MENU_CUE, menuOf } from "./menu.ts";
import { picksOf } from "./picks.ts";
import type { Start } from "./starts.ts";

// The line above a numbered list that says it holds decisions or questions, so its items are asks.
const DECISION_CUE =
  /\b(?:decisions?\s+(?:for you|to make|needed)|to decide|to confirm|need to know|choose between|questions?\s+(?:for you|before|to answer))\b[^.?!]*:?\s*$/i;

/** The items of a run, and the line the tail starts on. */
function itemsOf(doc: Doc, run: Start[]): { items: FormItem[]; tail: number } {
  let tail = doc.lines.length;
  const items = run.map((start, i) => {
    const { block, end } = blockOf(doc, start.line, run[i + 1]?.line);
    // A bare list's last item stops at a paragraph of its own: what follows is the message's.
    const last = !start.isQ && !run[i + 1];
    const { own, cut } = last ? ownLines(block) : { own: block, cut: 0 };
    tail = cut ? start.line + 1 + cut : end;
    return readItem(start, own);
  });
  return { items, tail };
}

const signals = (item: FormItem) =>
  item.title.includes("?") || item.options.length > 0 || item.recommended !== undefined;

/**
 * Whether the items are questions. A Q label is one on its own account, so it needs the message to
 * end on a question or an item to show a sign; a bare numbered list is a round when at least half
 * its items ask (a `?` anywhere in one counting), or the line above says it holds questions: a
 * closing "Want me to…?" over a list of done steps is not a round.
 */
function asks(doc: Doc, run: Start[], items: FormItem[]): boolean {
  if (run[0]?.isQ) return doc.text.trimEnd().endsWith("?") || items.some(signals);
  const asking = items.filter((item) => signals(item) || item.body.includes("?")).length;
  return (
    (asking > 0 && asking * 2 >= items.length) ||
    DECISION_CUE.test(lineAbove(doc, run[0]?.line ?? 0).text)
  );
}

/** A run as a pick list, a menu, or a round of questions; null when it is none of them. */
export function runOf(doc: Doc, run: Start[]): Split | null {
  const first = run[0];
  if (!first) return null;
  if (!first.isQ) {
    const picks = picksOf(doc, run);
    if (picks) return picks;
    // A line that is itself the question ("Want me to:") makes the list its options, before any
    // item is read as a question of its own.
    const menu = MENU_CUE.test(lineAbove(doc, first.line).text) ? menuOf(doc, run) : null;
    if (menu) return menu;
  }
  const { items, tail } = itemsOf(doc, run);
  if (asks(doc, run, items))
    return { form: { kind: "round", items }, starts: run.map((start) => start.line), tail };
  // A bare list that asks nothing may still be alternatives with one question after them.
  return first.isQ ? null : menuOf(doc, run);
}
