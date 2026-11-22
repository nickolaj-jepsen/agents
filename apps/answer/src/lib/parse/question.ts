/**
 * One question from where it opens and the lines under it: the options, the recommendation, and
 * everything else as the body. Every shape builds its questions here, so a lean, an option's
 * detail and a "(recommended)" marker read the same in a round, under a lead-in and in a menu.
 */
import type { FormItem, Option } from "../forms.ts";
import { dedent, isOption, type Line, textOf, tidy, unbold } from "./doc.ts";
import { leanParagraph, leansOn, opensOn, yesNo } from "./lean.ts";

/** What opens a question: the label a reply names it by, its title, and what else its line said. */
export type Stem = { label: string; title: string; rest: string };

/** Options and which of them its own words mark as the recommended one, -1 for none. */
export type Choices = { options: Option[]; marked: number };

// A parenthetical that says the option is the recommended one, however it is worded: it makes the card lean on it.
const MARKED = /\([^)]*\b(?:my recommendation|recommended|my pick)\b[^)]*\)/i;
// The exact "(recommended)" form, dropped from the option's words because the card says it already.
const MARKER = /\s*\((?:my recommendation|recommended|my pick)\)/gi;

/** The letter after `letter`. */
export const nextLetter = (letter: string) => String.fromCharCode(letter.charCodeAt(0) + 1);

/** Adds an option printed as `words`, with the lines that continued it. */
export function addOption(to: Choices, key: string, words: string, detail: string[]): void {
  if (MARKED.test(words)) to.marked = to.options.length;
  const text = words.replace(MARKER, "").replace(/\s+([.,;:])/g, "$1");
  to.options.push({ key, text, detail: tidy(detail) });
}

/**
 * The lines that continue the option at `lines[i]`, up to a blank line: those indented deeper
 * than it, and the bullets right under an option that is no bullet itself.
 */
function continuation(lines: Line[], i: number): Line[] {
  const option = lines[i];
  const under: Line[] = [];
  if (!isOption(option)) return under;
  for (let next = lines[i + 1]; next && next.kind !== "blank"; next = lines[i + 1 + under.length]) {
    const bullet = !option.mark.bullet && next.mark?.is === "bullet";
    if (next.indent <= option.indent && !bullet) break;
    under.push(next);
  }
  return under;
}

/** A recommendation's words: its line and the quote lines that go on with it. */
function leanAt(lines: Line[], i: number): { text: string; used: number } {
  const line = lines[i];
  const more: string[] = [];
  if (line?.quoted)
    for (let next = lines[i + 1]; next?.quoted; next = lines[i + 1 + more.length])
      more.push(next.raw.trimStart().slice(1).trim());
  const first = line?.mark?.is === "lean" ? line.mark.text : "";
  return { text: unbold([first, ...more].filter(Boolean).join(" ")), used: more.length };
}

/**
 * The lettered options among some lines, their Recommended line, and every other line. A list's
 * letters run on from its first, which may be B. With `lettered` off no line is an option.
 */
function scan(lines: Line[], lettered: boolean) {
  const found: Choices & { rest: string[]; lean?: string } = { options: [], marked: -1, rest: [] };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const last = found.options.at(-1);
    const next = lettered && isOption(line) && (!last || line.mark.key === nextLetter(last.key));
    const under = next ? continuation(lines, i) : [];
    if (line?.mark?.is === "lean") {
      const lean = leanAt(lines, i);
      found.lean = lean.text;
      i += lean.used;
    } else if (next && (line.mark.text || under[0])) {
      // A letter with no words of its own, `- **A.**`, takes them from the first line under it.
      const [first, ...below] = under;
      const lifted = !line.mark.text && first ? first : undefined;
      addOption(found, line.mark.key, lifted ? textOf(lifted) : line.mark.text, [
        line.mark.more,
        ...dedent(lifted ? below : under),
      ]);
      i += under.length;
    } else if (line) found.rest.push(line.raw);
  }
  return found;
}

/** Which options an item leans on: its recommendation's opening, else what its words say, else the one marked. */
function leanedOptions(
  { options, marked }: Choices,
  recommended: string,
  body: string,
): Pick<FormItem, "recommendedOption" | "recommendedOptions"> {
  const keys = options.map((option) => option.key);
  const opened = opensOn(recommended, keys);
  const picked = opened.length ? opened : leansOn(`${recommended}\n${body}`, keys);
  if (picked.length > 1) return { recommendedOptions: picked };
  const only = picked[0] ?? (marked >= 0 ? marked : undefined);
  return only === undefined ? {} : { recommendedOption: only };
}

/**
 * A question from its stem and the lines under it. `listed` are options the caller found itself (a
 * numbered list); without them the lettered options among the lines are read. `closing` are the
 * paragraphs the lines closed on, which join the body.
 */
export function readQuestion(
  stem: Stem,
  lines: Line[],
  closing: string[] = [],
  listed?: Choices,
): FormItem {
  const read = scan(lines, !listed);
  // A lone "A." is a sentence, not a choice: its line stays where it was.
  const found = listed || read.options.length >= 2 ? read : scan(lines, false);
  const choices = listed ?? found;
  const keys = choices.options.map((option) => option.key);
  const said = tidy([stem.rest, ...found.rest, ...closing.flatMap((paragraph) => ["", paragraph])]);
  // With no Recommended line a question may still lean in its own words: in a paragraph, or
  // with nothing to pick from, as a yes or no.
  const leaning =
    found.lean !== undefined
      ? null
      : keys.length
        ? leanParagraph(stem.title, said, keys)
        : yesNo(stem.title, said);
  const recommended = found.lean ?? leaning?.lean;
  const item: FormItem = {
    label: stem.label,
    title: leaning?.title ?? stem.title,
    body: leaning?.body ?? said,
    options: choices.options,
  };
  if (recommended !== undefined) item.recommended = recommended;
  return keys.length ? { ...item, ...leanedOptions(choices, recommended ?? "", item.body) } : item;
}
