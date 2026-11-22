/**
 * How a recommendation is worded, and which options its words name. Options are named by their
 * keys, letters or numbers alike, so one reader serves a lettered list and a numbered one.
 */
import { splitClosing, tidy, unbold } from "./doc.ts";

// A paragraph that opens by leaning: "I'd pick A, since…", "I lean toward C: …", "If you want one, I'd go with 2".
const LEAN_START =
  /^(?:If\b[^.?!\n]*?,\s+)?(?:I(?:'d| would| recommend| lean| suggest)\b|My (?:recommendation|pick|lean)\b)/i;
// Words that lean, ahead of the key they lean on: "I'd go with 2", "recommend: B".
const LEAN_WORDS =
  /\b(?:recommend(?:ed|ation)?:?|lean toward(?:s)?|(?:I'd|I would) (?:go with|pick|try|start with|choose|do))\s+/gi;
// "I recommend yes, it is cheap": a yes or no leaned on in a sentence of its own.
const YES_NO = /\b(?:I (?:recommend|suggest)|my recommendation is)\s+((?:yes|no)\b[^.\n]*\.?)/i;

// What strings keys together: "A, B and D", "A through C", "1–3".
const LINK = String.raw`\s*(?:,\s*and|,|and|&|\+|plus|through|to|–|-)\s*`;
// A dash is a range between keys ("A–C", "1-3"), but an em dash only ever sets a reason apart: "C — A is the mechanics".
const SPAN = /through|\bto\b|[–-]/;
// What may follow a lone key that opens a recommendation: "A. The format", "B, because", "C for now", never "A small".
const OPENING_END = /^(?:$|\s*[.,:;)]|\s+[—–-]\s|\s+(?:for now|first|initially|to start|today)\b)/;
const EDGE = "(?![A-Za-z0-9])";

/** Where the named keys sit among `keys`. Two joined as a span are everything between them, unless they run backwards ("C – A is…"). */
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
 * The options a text with no bold marks opens on: "A", "(a)", "Option 2", "A, B and D", "A through
 * C", "1–3". `strict` is for the words of a recommendation, where a lone key must be followed by
 * punctuation and may be lower case ("(a)"); after a lean word ("I'd go with A") a lower case "a"
 * is a word, and the key need only end. The keys strung on after the first are always as printed.
 */
function opening(text: string, keys: string[], strict: boolean): number[] {
  // Longest first, so "11" is not read as "1" twice.
  const any = [...keys]
    .sort((a, b) => b.length - a.length)
    .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const first = new RegExp(
    String.raw`^(?:option\s+|number\s+)?\(?(${any})${EDGE}`,
    strict ? "i" : "",
  ).exec(text);
  if (!first) return [];
  const rest = text.slice(first[0].length);
  const chain = new RegExp(`^(?:${LINK}(?:${any})${EDGE})+`).exec(rest.replace(/^\)/, ""))?.[0];
  if (strict && !chain && !OPENING_END.test(rest)) return [];
  const linked = chain?.match(new RegExp(`(?<![A-Za-z0-9])(?:${any})${EDGE}`, "g")) ?? [];
  return indicesOf([first[1] ?? "", ...linked], keys, SPAN.test(chain ?? ""));
}

/** The options a recommendation's own words open on. */
export const opensOn = (recommended: string, keys: string[]) =>
  opening(unbold(recommended), keys, true);

/** The options a text leans on in passing: "I'd go with 1, 2 and 6". */
export function leansOn(text: string, keys: string[]): number[] {
  const said = text.replaceAll("**", "");
  for (const lean of said.matchAll(LEAN_WORDS)) {
    const named = opening(said.slice(lean.index + lean[0].length), keys, false);
    if (named.length) return named;
  }
  return [];
}

/** What a question says once its lean is taken out of its words. */
export type Leaning = { lean: string; title: string; body: string };

/**
 * A question with options and no Recommended line may lean in a paragraph of its own, "I'd pick
 * A, since…", or lean and then ask. The lean is the recommendation's words; the ask stays.
 */
export function leanParagraph(title: string, body: string, keys: string[]): Leaning | null {
  const paras = body.split(/\n{2,}/);
  for (const [i, para] of paras.entries()) {
    const said = splitClosing(para);
    const lean = unbold(said.before);
    if (said.after || !LEAN_START.test(lean) || !leansOn(lean, keys).length) continue;
    paras[i] = said.ask;
    return { lean, title, body: paras.filter(Boolean).join("\n\n") };
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
