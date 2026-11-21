/** One question as its lines: the title it opens with, the options under it, its lean, and everything else as the body. */
import type { FormItem, Option } from "../forms.ts";
import { leanParagraph, leansOn, opensOn, recommendedAt, yesNo, type Leaning } from "./lean.ts";
import { indent, tidy, unbold } from "./lines.ts";

/** What opens a question: the label it printed, its title, and the rest of that line. */
export type Lead = { label: string; title: string; rest: string };

// `- **A.** …`, `- **A. …**`, `A) …`, `**B.** …`, `(c) …`, `- **(a)** …`; a letter may be lower case.
export const OPTION = /^(\s*)(?:[-*+]\s+)?(\*\*)?\(?([A-Ha-h])[.)](\*\*)?\s+(.+)$/;
const BULLET = /^\s*[-*+]\s/;
// A parenthetical that says the option is the recommended one, however it is worded: it makes the card lean on it.
const MARKED = /\([^)]*\b(?:my recommendation|recommended|my pick)\b[^)]*\)/i;
// The exact "(recommended)" form, dropped from the option's words because the card says it already.
const MARKER = /\s*\((?:my recommendation|recommended|my pick)\)/gi;

/** The letter after `letter`. */
export const nextLetter = (letter: string) => String.fromCharCode(letter.charCodeAt(0) + 1);

/** The letter a line opens an option with, upper case, or "". */
export const letterOf = (line: string) => (OPTION.exec(line)?.[3] ?? "").toUpperCase();

/** An option from the words it was printed with; `marked` when those say it is the recommended one. */
export function optionOf(key: string, words: string, detail: string[]) {
  const text = words.replace(MARKER, "").replace(/\s+([.,;:])/g, "$1");
  return {
    option: { key, text, detail: tidy(detail) } satisfies Option,
    marked: MARKED.test(words),
  };
}

/**
 * The lines that continue the option at `block[i]`, up to a blank line: those indented deeper than
 * its `margin`, and the bullets right under an option that is no bullet itself.
 */
function continuation(block: string[], i: number, margin: number): string[] {
  const plain = !BULLET.test(block[i] ?? "");
  const lines: string[] = [];
  for (let next = block[i + 1]; next?.trim(); next = block[i + 1 + lines.length]) {
    const bullet =
      plain &&
      BULLET.test(next) &&
      !OPTION.test(next) &&
      !recommendedAt(block, i + 1 + lines.length);
    if (indent(next) <= margin && !bullet) break;
    lines.push(next.trim());
  }
  return lines;
}

/** The option the line at `block[i]` opens when it is the next letter after `last`, and the last line it used. */
function optionAt(block: string[], i: number, last?: Option) {
  const opt = OPTION.exec(block[i] ?? "");
  if (!opt) return null;
  const [, margin = "", opened, rawLetter = "", closed, words = ""] = opt;
  const letter = rawLetter.toUpperCase();
  // A list's letters run on from its first, which may be B.
  if (last && letter !== nextLetter(last.key)) return null;
  const detail = continuation(block, i, margin.length);
  const { said, more } = splitBold(words, Boolean(opened) && !closed);
  return { ...optionOf(letter, said, [more, ...detail].filter(Boolean)), end: i + detail.length };
}

/**
 * `- **A. Title.** More words`: the bold part is the option, the rest its detail, which drops the
 * comma or colon that joined it on. A bold closed after the letter (`**A.** More **words**`)
 * leaves the words whole: `open` is false for it.
 */
function splitBold(words: string, open: boolean): { said: string; more: string } {
  const close = open ? words.indexOf("**") : -1;
  if (close <= 0) return { said: words.trim(), more: "" };
  const more = words.slice(close + 2).replace(/^\s*[,;:–—]\s*/, "");
  return { said: unbold(words.slice(0, close)), more: more.trim() };
}

type Scanned = { options: Option[]; marked: number; rest: string[]; recommended?: string };

/** The lettered options of a block, its Recommended line, and every other line. */
function scan(block: string[]): Scanned {
  const out: Scanned = { options: [], marked: -1, rest: [] };
  for (let i = 0; i < block.length; i++) {
    const recommended = recommendedAt(block, i);
    const opt = recommended ? null : optionAt(block, i, out.options.at(-1));
    if (recommended) {
      out.recommended = recommended.text;
      i = recommended.end;
    } else if (opt) {
      if (opt.marked) out.marked = out.options.length;
      out.options.push(opt.option);
      i = opt.end;
    } else out.rest.push(block[i] ?? "");
  }
  return out;
}

/** Which options an item leans on: its recommendation's opening, else what its words say, else the one marked. */
export function leanedOptions(
  options: Option[],
  words: { recommended: string; body: string },
  marked: number,
): Pick<FormItem, "recommendedOption" | "recommendedOptions"> {
  const keys = options.map((option) => option.key);
  const opened = opensOn(words.recommended, keys);
  const picked = opened.length ? opened : leansOn(`${words.recommended}\n${words.body}`, keys);
  if (picked.length > 1) return { recommendedOptions: picked };
  const only = picked[0] ?? (marked >= 0 ? marked : undefined);
  return only === undefined ? {} : { recommendedOption: only };
}

/** With no Recommended line a question may still lean in its own words: a paragraph, or for one with nothing to pick from, a yes or no. */
function leanInWords(title: string, said: string, choices: Option[]): Leaning | null {
  return choices.length
    ? leanParagraph(
        title,
        said,
        choices.map((option) => option.key),
      )
    : yesNo(title, said);
}

/** A question from its lead and the lines under it. */
export function readItem(lead: Lead, block: string[]): FormItem {
  const { options, marked, rest, recommended: line } = scan(block);
  // A lone "A." is a sentence, not a choice.
  const choices = options.length >= 2 ? options : [];
  const sentences = choices.length ? [] : options.flatMap((o) => [`${o.key}. ${o.text}`, o.detail]);
  const said = tidy([lead.rest, ...rest, ...sentences]);
  const leaning = line === undefined ? leanInWords(lead.title, said, choices) : null;
  const recommended = line ?? leaning?.lean;
  const item: FormItem = {
    label: lead.label,
    title: leaning?.title ?? lead.title,
    body: leaning?.body ?? said,
    options: choices,
  };
  if (recommended !== undefined) item.recommended = recommended;
  if (choices.length)
    Object.assign(
      item,
      leanedOptions(choices, { recommended: recommended ?? "", body: item.body }, marked),
    );
  return item;
}
