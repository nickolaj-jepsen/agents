/**
 * Recommendations: the words an agent leans with, and which options they name. Options are
 * named by their keys, letters or numbers alike, so one reader serves a lettered list and a menu.
 */
import { splitClosing, tidy, unbold } from "./lines.ts";

// `Recommended: A. …`, `**My recommendation:** …`, `➡️ …`, `> Recommendation: …`: group 1 is what follows the
// label. `My recommendation is …` has no colon: group 2 is the whole line, label kept, since it reads as a sentence.
export const RECOMMENDED =
  /^\s*(?:>\s*)?(?:(?:\**(?:(?:My )?recommend(?:ed|ation)(?: answer)?)\**\s*:\s*\**|➡️\s*)\s*(.*)|(\**(?:My )?recommend(?:ed|ation)(?: answer)?\**\s+is\s+.*))$/i;

// A paragraph that opens by leaning: "I'd pick A, since…", "I lean toward C: …".
const LEAN_START =
  /^\**(?:I(?:'d| would| recommend| lean| suggest)\b|My (?:recommendation|pick|lean)\b)/i;
// Words that lean, ahead of the key they lean on: "I'd go with 2", "recommend: B".
const LEAN_WORDS =
  /\b(?:recommend(?:ed|ation)?:?|lean toward(?:s)?|(?:I'd|I would) (?:go with|pick|try|start with|choose|do))\s+/gi;
// "I recommend yes, it is cheap": a yes or no leaned on in a sentence of its own.
const YES_NO = /\b(?:I (?:recommend|suggest)|my recommendation is)\s+((?:yes|no)\b[^.\n]*\.?)/i;

// A dash is a range between keys ("A–C", "1-3"), but an em dash only ever sets a reason apart: "C — A is the mechanics".
const SPAN = /through|\bto\b|[–-]/;
const LINK = String.raw`(?:,\s*and|,|and|&|\+|plus|through|to|–|-)`;
// What may follow a key that opens a recommendation: "A. The format", "B, because", "C for now", never "A small".
const OPENING_END = /^(?:$|\s*[.,:;)]|\s+[—–-]\s|\s+(?:for now|first|initially|to start|today)\b)/;

const escape = (key: string) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The keys a chain strings on after the first: ", B and D", "–C", " through C". */
const chainAfter = (text: string, any: string) =>
  new RegExp(String.raw`^(?:\s*${LINK}\s*\**(?:${any})\**(?![A-Za-z0-9]))+`).exec(text)?.[0];

/** Where keys sit among `keys`. Two joined by a dash or "through" are everything between them, unless they run backwards ("C – A is…"). */
function indicesOf(named: string[], keys: string[], span: boolean): number[] {
  const at = named
    .map((key) => keys.findIndex((k) => k.toLowerCase() === key.toLowerCase()))
    .filter((index) => index >= 0);
  const [from, to] = at;
  if (span && at.length === 2 && from !== undefined && to !== undefined)
    return from <= to ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : [from];
  return [...new Set(at)].sort((a, b) => a - b);
}

/**
 * The options a text opens on: "A", "(a)", "Option 2", "A, B and D", "A through C", "1–3".
 * `strict` is for the text of a recommendation, where a lone key must be followed by punctuation
 * and may be lower case ("(a)"); in the words after a lean word ("I'd go with A") a lower case
 * "a" is a word, and the key need only end.
 */
function opening(text: string, keys: string[], strict: boolean): number[] {
  // Longest first, so "11" is not read as "1" twice.
  const any = [...keys]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join("|");
  const first = new RegExp(
    String.raw`^\**(?:option\s+|number\s+)?\(?(${any})(?![A-Za-z0-9])`,
    strict ? "i" : "",
  ).exec(text);
  if (!first) return [];
  const rest = text.slice(first[0].length);
  const closed = rest.replace(/^\)?\**/, "");
  const chain = chainAfter(closed, any);
  if (strict && !chain && !OPENING_END.test(rest) && !OPENING_END.test(closed)) return [];
  const more = chain?.match(new RegExp(String.raw`(?<![A-Za-z0-9])(?:${any})(?![A-Za-z0-9])`, "g"));
  return indicesOf([first[1] ?? "", ...(more ?? [])], keys, chain ? SPAN.test(chain) : false);
}

/** The options a recommendation's own words open on. */
export const opensOn = (recommended: string, keys: string[]) => opening(recommended, keys, true);

/** The options a text leans on in passing: "I'd go with 1, 2 and 6". */
export function leansOn(text: string, keys: string[]): number[] {
  for (const lean of text.matchAll(LEAN_WORDS)) {
    const named = opening(text.slice(lean.index + lean[0].length), keys, false);
    if (named.length) return named;
  }
  return [];
}

/** The Recommended line at `block[i]`, with the quote lines that go on with it; `end` is the last line it used. */
export function recommendedAt(block: string[], i: number): { text: string; end: number } | null {
  const line = block[i] ?? "";
  const match = RECOMMENDED.exec(line);
  if (!match) return null;
  const more: string[] = [];
  let end = i;
  if (line.trimStart().startsWith(">"))
    while ((block[end + 1] ?? "").trimStart().startsWith(">"))
      more.push((block[++end] ?? "").trimStart().slice(1).trim());
  return { text: unbold([match[1] ?? match[2] ?? "", ...more].filter(Boolean).join(" ")), end };
}

/** What a question's text says besides its lean, once the lean is taken out. */
export type Leaning = { lean: string; title: string; body: string };

/**
 * A question with options and no Recommended line may lean in a paragraph of its own, "I'd pick
 * A, since…", or lean and then ask. The lean is the recommendation's words; the ask stays.
 */
export function leanParagraph(title: string, body: string, keys: string[]): Leaning | null {
  const paras = body.split(/\n{2,}/);
  for (const [i, para] of paras.entries()) {
    const said = splitClosing(para);
    const leans = said.before && LEAN_START.test(said.before) && leansOn(said.before, keys).length;
    if (!leans || said.after) continue;
    paras[i] = said.ask;
    return { lean: unbold(said.before), title, body: paras.filter(Boolean).join("\n\n") };
  }
  return null;
}

/**
 * A question with nothing to pick from may lean with a yes or no in passing. Said in the title,
 * it ends the title: the question is what came before, the rest is the body.
 */
export function yesNo(title: string, body: string): Leaning | null {
  const inTitle = YES_NO.exec(title);
  const before = inTitle ? title.slice(0, inTitle.index).trimEnd() : "";
  if (inTitle && before.endsWith("?")) {
    const after = title.slice(inTitle.index + inTitle[0].length).trim();
    return { lean: unbold(inTitle[1] ?? ""), title: before, body: tidy([after, body]) };
  }
  const inBody = YES_NO.exec(body);
  return inBody ? { lean: unbold(inBody[1] ?? ""), title, body } : null;
}
