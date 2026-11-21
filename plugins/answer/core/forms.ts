/**
 * The answer form, with no harness in it: find the question round or pick list a turn ended
 * on, step a draft of answers through it, and write the reply a person would have typed.
 * Pure and JSON-safe, in one file with no imports, so each harness loads it as it stands.
 *
 * Parsing is lenient on purpose: the skills' formats are the target, but any agent's numbered
 * questions should parse well enough to answer. A false positive costs a hint the person ignores.
 */

export type Option = { key: string; text: string; detail: string };

export type FormItem = {
  /** As printed ("Q3", "2"). */
  label: string;
  /** The message printed no label for this lone question, so the reply is only the answer. */
  unlabelled?: boolean;
  title: string;
  /** Markdown: what the item said besides its title, options and recommendation. */
  body: string;
  options: Option[];
  recommended?: string;
  recommendedOption?: number;
  recommendedOptions?: number[];
};

export type Form = { kind: "round" | "picks"; items: FormItem[] };

export type Answer =
  | { kind: "option"; index: number }
  | { kind: "options"; indices: number[] }
  | { kind: "accept" }
  | { kind: "text"; text: string };

export type Draft = {
  answers: (Answer | null)[];
  notes: string[];
  /** Said last, about the whole round. */
  note: string;
  /** The item shown, or the item count for the review. */
  step: number;
};

export type Action =
  | { do: "pick"; entry: number }
  | { do: "write" | "note"; text: string }
  | { do: "go"; step: number }
  | { do: "accept" | "next" | "back" | "forward" | "skip" | "clear" | "review" };

export type EntryKind = "option" | "accept" | "write";

export type Entry = {
  kind: EntryKind;
  /** The option's letter as the message printed it ("B"); "" for any other entry, and in a pick list. */
  key: string;
  text: string;
  /** The lines that continued it, drawn under it. */
  detail: string;
  isRecommended: boolean;
  isChosen: boolean;
};

export type ItemView = {
  label: string;
  title: string;
  body: string;
  entries: Entry[];
  /** The entry the cursor starts on. */
  start: number;
  /** What it recommends among its options and why, "" with none. */
  recommended: string;
  /** Whether the recommendation or answer is a bundle of options. */
  isSeveral: boolean;
  /** Whether there is a recommendation to take. */
  canAccept: boolean;
  /** The recommended option keys, e.g. "B" or "B, C"; empty for prose recommendations. */
  accepts: string;
  note: string;
  /** The write-in answer, "" for none. */
  written: string;
};

/** All a surface needs to draw the draft, with no form logic of its own. */
export type View = {
  id: string;
  kind: Form["kind"];
  title: string;
  count: number;
  answered: number;
  step: number;
  isReview: boolean;
  item: ItemView | null;
  review: { label: string; title: string; shown: string; isAnswered: boolean; note: string }[];
  note: string;
  reply: string;
};

/** A session's form and the answers so far: what a harness keeps between turns. */
export type Held = { form: Form; draft: Draft };

const FENCE = /^\s*(```|~~~)/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING = /^#{1,6}\s/;
// `**Q1. …**`, `### Q2: …`, `1. **…?** …`, `**3.** …`, `Q4) …`, `## Question 5: …`, `## Q6 — …`;
// unindented only. A dash separates only a Q label, which a bare number never takes.
const START =
  /^(?:#{1,6}\s+)?(\*\*)?(Q(?:uestion)?\s*)?([0-9]{1,3})(?:[.:)]|(?<=Q(?:uestion)?\s*[0-9]{1,3})\s*[—–-](?=\s))(\*\*)?(?:\s+|$)(.*)$/;
// `❓ **Q1** - **Title**: body`: the label closes its bold before any punctuation.
const EMOJI_START = /^❓\s*\*\*Q([0-9]{1,3})\*\*\s*[-–—:]\s*(.*)$/;
// `- **A.** …`, `- **A. …**`, `A) …`, `**B.** …`, `(c) …`, `- **(a)** …`; a letter may be lower case.
const OPTION = /^(\s*)(?:[-*+]\s+)?(\*\*)?\(?([A-Ha-h])[.)](\*\*)?\s+(.+)$/;
const RECOMMENDED =
  /^\s*(?:>\s*)?(?:\**(?:(?:My )?recommend(?:ed|ation)(?: answer)?)\**(?:\s*:\s*\**|\s+is\s+)|➡️\s*)\s*(.*)$/i;
const OWN_RECOMMENDATION = /\([^)]*\b(?:my recommendation|recommended|my pick)\b[^)]*\)/i;
// A letter, then punctuation or the end: "A. The format", "B, because", "**C**"; never "A small".
const LEADING_LETTER =
  /^(?:option\s+)?\**\(?([A-H])\)?\**(?=$|[\s]*[.,:;)]|\s+[—–-]\s|\s+(?:for now|first|initially|to start|today)\b)/i;
// Several letters leading a recommendation: "A, B and D now", "A through C", "**A** and **C**."
const LEADING_LETTERS =
  /^\**([A-H])\**((?:\s*(?:,\s*and|,|and|&|\+|through|to|–|-)\s*\**[A-H]\**(?![A-Za-z]))+)/;
const LONE_LETTER = /(?<![A-Za-z])[A-H](?![A-Za-z])/g;
const RANGE = /through|\bto\b|–|-/;
const RECOMMEND_IN_TEXT =
  /\b(?:recommend(?:ed|ation)?:?|lean (?:toward|towards)|(?:I'd|I would) (?:go with|pick|try|choose))\s+\**(?:option\s+)?([A-H])\b/;
// "I recommend yes, it is cheap": a yes or no leaned on in a sentence of its own.
const SAID_YES_NO = /\b(?:I (?:recommend|suggest)|my recommendation is)\s+((?:yes|no)\b[^.\n]*)/i;
// The same for a numbered menu: "I'd go with 2", "my recommendation: 1".
const RECOMMEND_NUMBER =
  /\b(?:recommend(?:ed|ation)?:?|lean (?:toward|towards)|(?:I'd|I would) (?:go with|pick|try|start with|choose))\s+\**(?:option\s+|number\s+)?([0-9]{1,2})\b/i;
// The line above a numbered list that says it holds decisions or questions, so its items are asks.
const DECISION_CUE =
  /\b(?:decisions?\s+(?:for you|to make|needed)|to decide|to confirm|need to know|choose between|questions?\s+(?:for you|before|to answer))\b[^.?!]*:?\s*$/i;
// A line that is itself the question a numbered list answers: "Want me to:" 1. 2. 3.
const MENU_CUE =
  /(?:^|[.!?—–]\s+)((?:want me to|shall i|should i|do you want me to|would you like me to)\b[^?]*):\s*$/i;
// A closing question that picks among the list above it, not one that asks to go ahead.
const CHOOSING =
  /\b(?:which|pick|choose|prefer|go with|start with|one of|both|either|option\s*[0-9]|[0-9]\s*(?:,|or|and|\/|\+)\s*[0-9])\b/i;
const ROUTES: [RegExp, string][] = [
  [/\/grill-me\b|\bgrill(?:ing)? (?:it )?first\b/i, "/grill-me"],
  [/\/brainstorm\b|\bbrainstorm(?:ing)? (?:it )?first\b/i, "/brainstorm"],
  [/(?:·|,)\s*build(?: it)?\b|^\s*build(?: it)?\.?\s*$/i, "build"],
];

type Start = {
  line: number;
  isQ: boolean;
  n: number;
  label: string;
  title: string;
  rest: string;
};

const unbold = (text: string) => text.replaceAll("**", "").trim();

const indent = (line: string) => line.length - line.trimStart().length;

const tidy = (lines: string[]) =>
  lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const letterIndex = (letter: string) => letter.toUpperCase().charCodeAt(0) - 65;

/** Title and the rest of a start line, whether the bold wraps the label, the title or nothing. */
function splitTitle(isBoldLead: boolean, rest: string): [string, string] {
  if (isBoldLead) {
    const end = rest.indexOf("**");
    return end < 0 ? [rest, ""] : [rest.slice(0, end), rest.slice(end + 2)];
  }
  if (rest.startsWith("**")) {
    const end = rest.indexOf("**", 2);
    if (end > 0) return [rest.slice(2, end), rest.slice(end + 2)];
  }
  return [rest, ""];
}

function findStarts(lines: string[]): Start[] {
  const starts: Start[] = [];
  let inFence = false;
  lines.forEach((line, i) => {
    if (FENCE.test(line)) inFence = !inFence;
    if (inFence) return;
    const emoji = EMOJI_START.exec(line);
    if (emoji) {
      // `**Title**: body` after the label: the bold part is the title.
      const [, n = "", after = ""] = emoji;
      const [title, rest] = splitTitle(false, after);
      const [heading, tail] = rest.startsWith(":") ? [title, rest.slice(1)] : [title, rest];
      if (unbold(heading))
        starts.push({
          line: i,
          isQ: true,
          n: Number(n),
          label: `Q${n}`,
          title: unbold(heading),
          rest: tail.trim(),
        });
      return;
    }
    const match = START.exec(line);
    if (!match) return;
    const [, bold, q, n = "", closed, after = ""] = match;
    // `**Q1.** …` closed its bold on the label, so a `**` after it is the title's own.
    const [title, rest] = splitTitle(Boolean(bold) && !closed, after);
    if (!unbold(title)) return;
    starts.push({
      line: i,
      isQ: Boolean(q),
      n: Number(n),
      label: q ? `Q${n}` : n,
      title: unbold(title),
      rest: rest.trim(),
    });
  });
  return starts;
}

/** The trailing run of starts: a run restarts where the numbering goes back. */
function lastRun(starts: Start[]): Start[] {
  let run: Start[] = [];
  for (const start of starts) {
    const last = run[run.length - 1];
    if (last && start.n <= last.n) run = [];
    run.push(start);
  }
  return run;
}

/**
 * The lines an item owns: up to the next item. The last one ends where a rule or heading
 * starts what follows the round, which `split` hands back as the tail. Between items the
 * lines are the item's own, so no prose goes unshown; only the rules that separate are dropped.
 * `end` is the first line it did not read.
 */
function blockOf(
  lines: string[],
  start: Start,
  following: Start | undefined,
): { block: string[]; end: number } {
  const block: string[] = [];
  let inFence = false;
  let end = following ? following.line : lines.length;
  for (let i = start.line + 1; i < end; i++) {
    const line = lines[i] ?? "";
    if (FENCE.test(line)) inFence = !inFence;
    if (!inFence && !following && (RULE.test(line) || HEADING.test(line))) {
      end = i;
      break;
    }
    block.push(line);
  }
  while (
    block.length &&
    (!block[block.length - 1]?.trim() || RULE.test(block[block.length - 1] ?? ""))
  )
    block.pop();
  return { block, end };
}

/** The options a recommendation opens on when it names several, a range read as all of it. */
function leadingLetters(recommended: string, count: number): number[] {
  const match = LEADING_LETTERS.exec(recommended);
  if (!match) return [];
  let letters = (match[0].match(LONE_LETTER) ?? []).map(letterIndex);
  const [first, last] = letters;
  if (
    RANGE.test(match[2] ?? "") &&
    letters.length === 2 &&
    first !== undefined &&
    last !== undefined
  )
    letters = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
  const picked = [...new Set(letters)].sort((a, b) => a - b);
  const highest = picked[picked.length - 1];
  return highest !== undefined && highest < count ? picked : [];
}

function parseItem(start: Start, block: string[]): FormItem {
  const body = start.rest ? [start.rest] : [];
  const options: Option[] = [];
  let recommended: string | undefined;
  let ownPick: number | undefined;
  for (let i = 0; i < block.length; i++) {
    const line = block[i] ?? "";
    const rec = RECOMMENDED.exec(line);
    if (rec) {
      // A blockquote recommendation goes on over the quote's following lines.
      const more: string[] = [];
      if (line.trimStart().startsWith(">"))
        while ((block[i + 1] ?? "").trimStart().startsWith(">")) {
          i++;
          more.push((block[i] ?? "").trimStart().slice(1).trim());
        }
      recommended = unbold([rec[1] ?? "", ...more].filter(Boolean).join(" "));
      continue;
    }
    const opt = OPTION.exec(line);
    const next = options.length
      ? String.fromCharCode(65 + letterIndex(options[0]?.key ?? "A") + options.length)
      : (opt?.[3] ?? "").toUpperCase();
    if (opt && (opt[3] ?? "").toUpperCase() === next) {
      const [, lead = "", opened, rawLetter = "", closed, words = ""] = opt;
      const letter = rawLetter.toUpperCase();
      const detail: string[] = [];
      for (
        let next = block[i + 1];
        next?.trim() && indent(next) > lead.length;
        next = block[i + 1]
      ) {
        i++;
        detail.push(next.trim());
      }
      // `- **A. Title.** More words`: the bold part is the option, the rest its detail. A bold
      // closed after the letter (`**A.** More **words**`) leaves the words whole.
      const close = opened && !closed ? words.indexOf("**") : -1;
      if (close > 0) detail.unshift(words.slice(close + 2).trim());
      // A bold inside the words is the option's own, set by a surface that draws markdown.
      const text = close > 0 ? unbold(words.slice(0, close)) : words.trim();
      if (OWN_RECOMMENDATION.test(text)) ownPick = options.length;
      options.push({ key: letter, text, detail: tidy(detail) });
      continue;
    }
    body.push(line);
  }
  // A lone "A." is a sentence, not a choice.
  const choices = options.length >= 2 ? options : [];
  if (!choices.length)
    for (const option of options) body.push(`${option.key}. ${option.text}`, option.detail);
  const bodyText = tidy(body);
  // A yes or no said in passing, "I recommend yes, it is cheap", is the recommendation of a
  // question with nothing to pick from.
  if (recommended === undefined && !options.length) {
    const inline = SAID_YES_NO.exec(`${start.title} ${start.rest} ${bodyText}`);
    if (inline) recommended = unbold(inline[1] ?? "");
  }
  const item: FormItem = {
    label: start.label,
    title: start.title,
    body: bodyText,
    options: choices,
  };
  if (recommended !== undefined) item.recommended = recommended;
  if (choices.length) {
    const leading = recommended ? LEADING_LETTER.exec(recommended) : null;
    const letter = (leading ?? RECOMMEND_IN_TEXT.exec(bodyText))?.[1];
    // A revised list may start at B: letters count from its first option.
    const offset = letterIndex(choices[0]?.key ?? "A");
    const index = letter ? letterIndex(letter) - offset : (ownPick ?? -1);
    const several = leadingLetters(recommended ?? "", choices.length + offset)
      .map((i) => i - offset)
      .filter((i) => i >= 0);
    if (several.length > 1) item.recommendedOptions = several;
    else if (index >= 0 && index < choices.length) item.recommendedOption = index;
  }
  return item;
}

const routeOf = (line: string) => ROUTES.find(([pattern]) => pattern.test(line))?.[1];

/** The pick list and the line its tail starts on; the prose between rows stays with the row before. */
function parsePicks(lines: string[], run: Start[]): { form: Form; end: number } | null {
  const items: FormItem[] = [];
  let end = lines.length;
  for (const [index, start] of run.entries()) {
    const own = [lines[start.line] ?? ""];
    let next = start.line + 1;
    for (; next < lines.length; next++) {
      const line = lines[next] ?? "";
      if (!line.trim() || indent(line) < 2) break;
      own.push(line);
    }
    const route = routeOf(own[own.length - 1] ?? "");
    if (!route) return null;
    const following = run[index + 1];
    const between = following ? lines.slice(next, following.line) : [];
    if (!following) end = next;
    // `<title> · <size> · <next>` keeps its fields beside the title.
    const [title = "", ...fields] = [start.title, start.rest]
      .filter(Boolean)
      .join(" ")
      .split(" · ");
    const detail = [
      fields.join(" · "),
      ...own.slice(1).map((line) => line.trim()),
      ...between.filter((line) => line.trim() && !RULE.test(line)).map((line) => line.trim()),
    ].filter(Boolean);
    const options: Option[] = [{ key: "build", text: "Build it", detail: "" }];
    if (route !== "build") options.push({ key: route, text: `Route to ${route}`, detail: "" });
    items.push({
      label: start.label,
      title: unbold(title),
      body: detail.join("\n"),
      options,
      recommended: route === "build" ? "build it" : `route it to ${route}`,
      recommendedOption: route === "build" ? 0 : 1,
    });
  }
  return items.length ? { form: { kind: "picks", items }, end } : null;
}

/**
 * Where a message's lines went: the form it asks, the line each item starts on, and the line
 * the tail starts on. The lines before the first start are the head, each item owns the lines to
 * the next start, and the tail is what follows the last one, so the three cover every line.
 */
export type Split = { form: Form; starts: number[]; tail: number };

/** The nearest line above `line` that says something, markup off, and where it was. */
function cueAbove(lines: string[], line: number): { text: string; at: number } {
  for (let i = line - 1; i >= Math.max(0, line - 3); i--) {
    const text = (lines[i] ?? "").replace(/^#{1,6}\s+/, "").trim();
    if (text) return { text: unbold(text), at: i };
  }
  return { text: "", at: -1 };
}

/** Where a block's first unindented paragraph after a blank line starts, -1 for none. */
function paragraphBreak(block: string[]): number {
  for (let i = 1; i < block.length; i++)
    if (!(block[i - 1] ?? "").trim() && (block[i] ?? "").trim() && indent(block[i] ?? "") === 0)
      return i;
  return -1;
}

/** The paragraphs of some lines, split where a line is blank. */
function paragraphs(lines: string[]): string[][] {
  const out: string[][] = [];
  let open: string[] = [];
  for (const line of lines) {
    if (line.trim()) open.push(line);
    else if (open.length) {
      out.push(open);
      open = [];
    }
  }
  if (open.length) out.push(open);
  return out;
}

/**
 * A numbered list of alternatives followed by one question that picks among them ("Which do you
 * want?"), or under a cue that is the question ("Want me to:"), is one question whose options are
 * the list, keyed by the numbers it printed.
 */
function menuOf(lines: string[], run: Start[]): Split | null {
  const first = run[0];
  if (!first || run.length < 2 || first.isQ) return null;
  const last = run[run.length - 1] as Start;
  const { block: lastBlock, end } = blockOf(lines, last, undefined);
  const { text: cue, at: cueAt } = cueAbove(lines, first.line);
  const cueLine = MENU_CUE.test(cue);
  let closing: string[] = [];
  let ownLines = lastBlock;
  // The item's own first line is paragraph one; a closing question is a paragraph after it.
  const trailing = paragraphs([lines[last.line] ?? "", ...lastBlock]);
  const tailPara = trailing[trailing.length - 1];
  if (
    trailing.length > 1 &&
    tailPara &&
    indent(tailPara[0] ?? "") === 0 &&
    !START.test(tailPara[0] ?? "")
  ) {
    const asked = tailPara.join(" ").trim();
    if (asked.endsWith("?") && CHOOSING.test(asked)) {
      closing = tailPara;
      ownLines = lastBlock.slice(0, lastBlock.lastIndexOf(tailPara[0] ?? ""));
    }
  }
  if (!closing.length && !cueLine) return null;
  const options: Option[] = [];
  let ownPick: number | undefined;
  for (const [i, start] of run.entries()) {
    const block = run[i + 1] ? blockOf(lines, start, run[i + 1]).block : ownLines;
    const text = start.title;
    if (OWN_RECOMMENDATION.test(text)) ownPick = i;
    options.push({ key: String(start.n), text, detail: tidy([start.rest, ...block]) });
  }
  const cueWords = MENU_CUE.exec(cue)?.[1] ?? "";
  // The closing paragraph says what it leans toward, then asks: the ask is the title.
  const sentences = tidy(closing).split(/(?<=[.!?])\s+/);
  let ask = sentences.length - 1;
  while (ask > 0 && !sentences[ask]?.endsWith("?")) ask--;
  const lean = ask > 0 ? sentences.slice(0, ask).join(" ") : "";
  const asked = closing.length
    ? unbold(ask > 0 ? sentences.slice(ask).join(" ") : tidy(closing))
    : cueWords;
  const leanText = closing.join(" ");
  const said = RECOMMEND_NUMBER.exec(leanText);
  // "I'd go with 1, 2 and 6": every number the lean strings together.
  const more = said
    ? /^((?:\s*(?:,\s*and|,|and|&|\+|plus)\s*[0-9]{1,2}\b)+)/.exec(
        leanText.slice(said.index + said[0].length),
      )
    : null;
  const numbers = said ? [said[1], ...(more?.[1]?.match(/[0-9]{1,2}/g) ?? [])] : [];
  const leant = [...new Set(numbers.map((n) => options.findIndex((option) => option.key === n)))]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  const wanted = leant[0] ?? ownPick ?? -1;
  const item: FormItem = {
    label: "Q1",
    unlabelled: true,
    title: asked,
    body: "",
    options,
  };
  if (leant.length > 1) {
    item.recommendedOptions = leant;
    item.recommended = unbold(lean || tidy(closing));
  } else if (wanted >= 0) {
    item.recommendedOption = wanted;
    if (closing.length) item.recommended = unbold(lean || tidy(closing));
  }
  return {
    form: { kind: "round", items: [item] },
    // The cue is the whole question only when it is a line of its own; else it stays in the head.
    starts: [cueLine && !closing.length && cue === cueWords && cueAt >= 0 ? cueAt : first.line],
    tail: end,
  };
}

/** The lines outside any fence, with where each was, so a search never reads a quoted format. */
const outsideFences = (lines: string[]): [string, number][] => {
  let inFence = false;
  const kept: [string, number][] = [];
  lines.forEach((line, i) => {
    if (FENCE.test(line)) inFence = !inFence;
    else if (!inFence) kept.push([line, i]);
  });
  return kept;
};

/**
 * One question with no number: a block of lettered options after its lead-in line, closed by
 * a question or carrying a recommendation; or a question line followed by a recommendation line.
 * The option-less shape asks for the recommendation, so a bare "Want me to push?" stays prose.
 */
function singleOf(lines: string[]): Split | null {
  const kept = outsideFences(lines);
  const at = (n: number) => kept[n];
  let titleAt = -1;
  // The first option line whose next option follows within a few lines: a lone "A." is a sentence.
  const letterOf = (n: number) => (OPTION.exec(at(n)?.[0] ?? "")?.[3] ?? "").toUpperCase();
  const optionAt = kept.findIndex((_, n) => {
    const here = letterOf(n);
    if (!here) return false;
    for (let k = n + 1; k <= n + 8; k++)
      if (letterOf(k) === String.fromCharCode(here.charCodeAt(0) + 1)) return true;
    return false;
  });
  if (optionAt >= 0) {
    // The nearest line above that asks, else the nearest line: a bold "Your decision" lead-in.
    const above: number[] = [];
    for (let up = optionAt - 1; up >= 0 && above.length < 6; up--)
      if ((at(up)?.[0] ?? "").trim()) above.push(up);
    titleAt = above.find((n) => /\?\**\s*$/.test(at(n)?.[0] ?? "")) ?? above[0] ?? -1;
  } else {
    const recAt = kept.findIndex(([line]) => RECOMMENDED.test(line));
    if (recAt > 0)
      for (let up = recAt - 1; up >= Math.max(0, recAt - 6); up--)
        if ((at(up)?.[0] ?? "").trim().endsWith("?") || /\?\**\s*$/.test(at(up)?.[0] ?? "")) {
          titleAt = up;
          break;
        }
  }
  const titleLine = titleAt >= 0 ? at(titleAt) : undefined;
  if (!titleLine) return null;
  const [raw, line] = titleLine;
  const lead = raw
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .trim();
  // A long line leads with its bold or its first sentence; the rest is the question's body.
  const bold = /^\*\*(.+?)\*\*\s*(.*)$/.exec(lead);
  const sentence = /^(.{20,160}?[.!?])\s+(.*)$/.exec(lead);
  const [headWords = lead, restWords = ""] =
    lead.length <= 160
      ? [lead, ""]
      : bold
        ? [bold[1], bold[2]]
        : sentence
          ? [sentence[1], sentence[2]]
          : [lead.slice(0, 160), lead.slice(160)];
  // A bare "Q." label with no number is not part of the title.
  const title = unbold(headWords.replace(/:\s*$/, "")).replace(/^Q\s*[.:)]\s+/, "");
  // The closer of a grilling is answered with a plain "yes"; it gets no card.
  if (!title || /shared understanding/i.test(title)) return null;
  const start: Start = { line, isQ: true, n: 1, label: "Q1", title, rest: restWords ?? "" };
  const { block, end } = blockOf(lines, start, undefined);
  const item = parseItem(start, block);
  item.unlabelled = true;
  const rec = item.recommended !== undefined || item.recommendedOption !== undefined;
  const closing = paragraphs(lines).at(-1)?.join(" ") ?? "";
  const asks = item.options.length >= 2 ? closing.includes("?") || rec : rec;
  return asks ? { form: { kind: "round", items: [item] }, starts: [line], tail: end } : null;
}

/** The runs worth trying, best first: the Q-labelled one, then every numbered one. */
function candidates(starts: Start[]): Start[][] {
  const labelled = lastRun(starts.filter((start) => start.isQ));
  const all = lastRun(starts);
  return labelled.length && labelled.length !== all.length ? [labelled, all] : [all];
}

function splitRun(text: string, lines: string[], run: Start[]): Split | null {
  const first = run[0];
  if (!first) return null;
  const starts = run.map((start) => start.line);
  if (!first.isQ) {
    const picks = parsePicks(lines, run);
    if (picks) return { form: picks.form, starts, tail: picks.end };
  }
  // A line that is itself the question over a list of alternatives makes the list its options.
  if (!first.isQ && MENU_CUE.test(cueAbove(lines, first.line).text)) {
    const menu = menuOf(lines, run);
    if (menu) return menu;
  }
  let tail = lines.length;
  const items = run.map((start, i) => {
    const { block, end } = blockOf(lines, start, run[i + 1]);
    tail = end;
    // A bare list's last item stops at a paragraph of its own: what follows is the message's.
    const cut = !first.isQ && !run[i + 1] ? paragraphBreak(block) : -1;
    if (cut > 0) tail = start.line + 1 + cut;
    return parseItem(start, cut > 0 ? block.slice(0, cut) : block);
  });
  const signal = items.some(
    (item) => item.title.includes("?") || item.recommended !== undefined || item.options.length,
  );
  // A Q label is a question on its own account; a bare numbered list needs a sign of its own,
  // or the list above it saying it holds questions: a closing "Want me to…?" over a list of
  // done steps is not a round.
  const asks = first.isQ
    ? text.trimEnd().endsWith("?") || signal
    : signal || DECISION_CUE.test(cueAbove(lines, first.line).text);
  if (asks) return { form: { kind: "round", items }, starts, tail };
  return first.isQ ? null : menuOf(lines, run);
}

/** Where a message's lines went, or null when it asks nothing. */
export function split(text: string): Split | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const run of candidates(findStarts(lines))) {
    const found = splitRun(text, lines, run);
    if (found) return found;
  }
  return singleOf(lines);
}

/** The round or pick list a message ends on, or null when it asks nothing. */
export const parse = (text: string): Form | null => split(text)?.form ?? null;

/** The line each item `parse` finds starts on, so a harness can cut the message up. */
export const startLines = (text: string): number[] => split(text)?.starts ?? [];

/** What the message says after its last item, which no card draws: markdown, "" when none. */
export function tailOf(text: string): string {
  const found = split(text);
  if (!found) return "";
  const lines = text.replace(/\r\n?/g, "\n").split("\n").slice(found.tail);
  while (lines.length && (!lines[0]?.trim() || RULE.test(lines[0] ?? ""))) lines.shift();
  return tidy(lines);
}

/** JSON with its keys in order, so the same form always reads the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const fields = Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${fields.map(([key, field]) => `${JSON.stringify(key)}:${canonical(field)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** FNV-1a over UTF-16 units from a seed; no harness offers a hash to a module with no imports. */
function fnv(text: string, seed: number): string {
  let hash = seed;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Names a form by what it asks: a turn that asks the same round again keeps its answers, and
 * a step aimed at an older form lands on nothing.
 */
export function formId(form: Form): string {
  const text = canonical(form);
  return fnv(text, 0x811c9dc5) + fnv(text, 0x01234567);
}

export function newDraft(form: Form): Draft {
  const count = form.items.length;
  return {
    answers: Array.from({ length: count }, () => null),
    notes: Array.from({ length: count }, () => ""),
    note: "",
    step: 0,
  };
}

export const isReview = (form: Form, draft: Draft) => draft.step >= form.items.length;

export const go = (form: Form, draft: Draft, step: number): Draft => ({
  ...draft,
  step: Math.max(0, Math.min(form.items.length, step)),
});

const canAccept = (item: FormItem) =>
  item.recommended !== undefined ||
  item.recommendedOption !== undefined ||
  item.recommendedOptions !== undefined;

function accepted(item: FormItem): Answer {
  if (item.recommendedOptions) return { kind: "options", indices: item.recommendedOptions };
  if (item.recommendedOption !== undefined)
    return { kind: "option", index: item.recommendedOption };
  return { kind: "accept" };
}

type Row = { kind: "option"; index: number } | { kind: "accept" } | { kind: "write" };

/**
 * What the form offers for one item: its options, or with none its recommendation,
 * and a write-in. Beside options a recommendation is only said, never an entry of its own.
 */
export function entries(item: FormItem): Row[] {
  const rows: Row[] = item.options.map((_, index) => ({ kind: "option", index }));
  if (item.recommended !== undefined && !rows.length) rows.push({ kind: "accept" });
  rows.push({ kind: "write" });
  return rows;
}

function isChosen(item: FormItem, answer: Answer | null, entry: Row): boolean {
  if (!answer) return false;
  if (entry.kind === "write") return answer.kind === "text";
  if (entry.kind === "accept") return answer.kind === "accept";
  if (answer.kind === "option") return answer.index === entry.index;
  if (answer.kind === "options") return answer.indices.includes(entry.index);
  return answer.kind === "accept" && item.recommendedOption === entry.index;
}

/** The answer's entry, else the recommendation's, else the first. */
function startEntry(item: FormItem, answer: Answer | null): number {
  const rows = entries(item);
  const chosen = rows.findIndex((entry) => isChosen(item, answer, entry));
  if (chosen >= 0) return chosen;
  return Math.max(
    0,
    rows.findIndex((entry) => isChosen(item, { kind: "accept" }, entry)),
  );
}

const withAnswer = (draft: Draft, value: Answer | null): Draft => ({
  ...draft,
  answers: draft.answers.map((answer, i) => (i === draft.step ? value : answer)),
});

const clear = (form: Form, draft: Draft) =>
  isReview(form, draft) ? draft : withAnswer(draft, null);

/** Records the shown item's answer and stays on it, so a note can follow. */
function record(form: Form, draft: Draft, value: Answer): Draft {
  const item = form.items[draft.step];
  if (!item) return draft;
  if (value.kind === "accept" && !canAccept(item)) return draft;
  if (value.kind === "option" && !(value.index >= 0 && value.index < item.options.length))
    return draft;
  if (value.kind === "options" && !value.indices.length) return clear(form, draft);
  if (value.kind === "text") {
    const text = value.text.trim();
    return text ? withAnswer(draft, { kind: "text", text }) : clear(form, draft);
  }
  return withAnswer(draft, value);
}

/**
 * After an answer: the next item still unanswered, looking on and then from the top, or the
 * review when every item has one.
 */
function onward(form: Form, draft: Draft): Draft {
  const count = form.items.length;
  const order = [
    ...Array.from({ length: Math.max(0, count - draft.step - 1) }, (_, i) => draft.step + 1 + i),
    ...Array.from({ length: Math.min(draft.step, count) }, (_, i) => i),
  ];
  return go(form, draft, order.find((i) => !draft.answers[i]) ?? count);
}

/** The shown item's note, or on the review the whole round's. */
function setNote(form: Form, draft: Draft, text: string): Draft {
  const note = text.trim();
  if (isReview(form, draft)) return { ...draft, note };
  return { ...draft, notes: draft.notes.map((held, i) => (i === draft.step ? note : held)) };
}

/**
 * The draft after one thing a person did; what can't apply changes nothing.
 *
 * `pick` takes `entry`, an index into the shown item's entries (a write-in has nothing to
 * record until `write`); `write` records text and goes on;
 * `accept` takes the item's recommendation, whatever it names; `next` goes on to the next item
 * unanswered. Throws for a word it doesn't know.
 */
export function apply(form: Form, draft: Draft, action: Action): Draft {
  const { step } = draft;
  const item = form.items[step];
  switch (action.do) {
    case "pick": {
      const row = item ? entries(item)[action.entry] : undefined;
      if (!row || row.kind === "write") return draft;
      return record(form, draft, row);
    }
    case "write": {
      const written = record(form, draft, { kind: "text", text: action.text ?? "" });
      return written.answers[step] ? onward(form, written) : written;
    }
    case "note":
      return setNote(form, draft, action.text ?? "");
    case "accept":
      return item && canAccept(item) ? record(form, draft, accepted(item)) : draft;
    case "next":
      return isReview(form, draft) ? draft : onward(form, draft);
    case "go":
      return go(form, draft, action.step ?? step);
    case "back":
      return go(form, draft, step - 1);
    case "forward":
      return go(form, draft, step + 1);
    case "skip":
      return go(form, clear(form, draft), step + 1);
    case "clear":
      return clear(form, draft);
    case "review":
      return go(form, draft, form.items.length);
    default:
      throw new Error(`no such action: ${JSON.stringify((action as { do?: unknown }).do)}`);
  }
}

const isSame = (a: number[], b: (number | undefined)[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

function isRecommended(item: FormItem, answer: Answer | null): boolean {
  if (!answer) return false;
  if (answer.kind === "options")
    return isSame(answer.indices, item.recommendedOptions ?? [item.recommendedOption]);
  return (
    answer.kind === "accept" ||
    (answer.kind === "option" && answer.index === item.recommendedOption)
  );
}

const keyAt = (item: FormItem, index: number) => item.options[index]?.key ?? "";

/** A short button label and the prose beside it on native surfaces. */
export function recommendationChoice(text: string): { tag: string; label: string } {
  const lead = /^(yes|no)(?:[.,:;!?]\s*|\s+[—–-]\s+|$)/i.exec(text);
  if (!lead) return { tag: "Accept", label: text };
  return {
    tag: lead[1]?.toLowerCase() === "yes" ? "Yes" : "No",
    label: text.slice(lead[0].length),
  };
}

const recommendationText = (item: FormItem) => item.recommended || "As recommended";

/** What the reply says for one answer: a recommendation, option keys, a route, or the text. */
function said(item: FormItem, answer: Answer): string {
  if (answer.kind === "text") return answer.text;
  if (answer.kind === "options")
    return answer.indices.map((index) => keyAt(item, index)).join(", ");
  const index = answer.kind === "option" ? answer.index : item.recommendedOption;
  if (index !== undefined) return keyAt(item, index);
  const recommended = recommendationText(item);
  return recommendationChoice(recommended).tag === "Yes" ? "yes" : recommended;
}

const NO_ANSWER = "no answer yet";

/** A text's lines after the first, indented to sit under the first: one block in the reply. */
const under = (text: string, indent: number) => text.split("\n").join(`\n${" ".repeat(indent)}`);

const NOTE_LEAD = "    Note: ";

const noted = (line: string, note: string) =>
  note ? [line, `${NOTE_LEAD}${under(note, NOTE_LEAD.length)}`] : [line];

const saying = (label: string, said: string) => `${label}: ${under(said, label.length + 2)}`;

const rowsOf = (form: Form, draft: Draft) =>
  form.items.map((item, i) => ({
    item,
    answer: draft.answers[i] ?? null,
    note: draft.notes[i] ?? "",
  }));

function roundReply(form: Form, draft: Draft): string[] {
  const rows = rowsOf(form, draft);
  if (
    !draft.note &&
    rows.every(
      ({ item, answer, note }) =>
        !note &&
        isRecommended(item, answer) &&
        (answer?.kind !== "accept" || said(item, answer) === "yes"),
    )
  )
    return ["yes"];
  return rows.flatMap(({ item, answer, note }) => {
    if (answer) {
      const words = said(item, answer);
      return noted(item.unlabelled ? words : saying(item.label, words), note);
    }
    return note ? noted(`${item.label}: ${NO_ANSWER}`, note) : [];
  });
}

function picksReply(form: Form, draft: Draft): string[] {
  const builds: string[] = [];
  const rest: string[] = [];
  for (const { item, answer, note } of rowsOf(form, draft)) {
    const { label } = item;
    if (!answer) {
      if (note) rest.push(...noted(`${label}: ${NO_ANSWER}`, note));
      continue;
    }
    const what = said(item, answer);
    if (what === "build" && !note) builds.push(label);
    else if (what === "build") rest.push(...noted(`do ${label}`, note));
    else if (answer.kind === "text") rest.push(...noted(saying(label, answer.text), note));
    else rest.push(...noted(`${label} → ${what}`, note));
  }
  return [...(builds.length ? [`do ${builds.join(", ")}`] : []), ...rest];
}

/** The reply as the person would type it; "" when nothing was answered. */
export function reply(form: Form, draft: Draft): string {
  const lines = form.kind === "round" ? roundReply(form, draft) : picksReply(form, draft);
  if (draft.note) lines.push(saying("Overall", draft.note));
  return lines.join("\n");
}

function entryText(form: Form, item: FormItem, entry: Row): string {
  if (entry.kind === "write")
    return form.kind === "round" ? "Write your own answer" : "Something else";
  if (entry.kind === "accept") return recommendationText(item);
  const option = item.options[entry.index];
  if (!option) return "";
  return form.kind === "round" ? `${option.key}. ${option.text}` : option.text;
}

const textAt = (item: FormItem, index: number) => item.options[index]?.text ?? "";

/** Inline markdown as plain words: a surface that draws a line as text has no use for the marks. */
export const plain = (text: string) =>
  text
    .replace(/`+([^`]*)`+/g, "$1")
    .replaceAll("**", "")
    .replace(/\s+/g, " ")
    .trim();

/** What an answer reads as on the review: the option's words, not just its key. */
function shown(item: FormItem, answer: Answer | null): string {
  if (!answer) return "skipped";
  if (answer.kind === "text") return `"${answer.text}"`;
  if (answer.kind === "options")
    return plain(
      `${said(item, answer)}: ${answer.indices.map((index) => textAt(item, index)).join("; ")}`,
    );
  const index = answer.kind === "option" ? answer.index : item.recommendedOption;
  return plain(
    index === undefined ? said(item, answer) : `${said(item, answer)}: ${textAt(item, index)}`,
  );
}

export function title(form: Form): string {
  const count = form.items.length;
  const plural = count === 1 ? "" : "s";
  return form.kind === "round"
    ? `Answer ${count} question${plural}`
    : `Pick from ${count} item${plural}`;
}

function itemView(form: Form, draft: Draft): ItemView | null {
  const item = form.items[draft.step];
  if (!item) return null;
  const answer = draft.answers[draft.step] ?? null;
  const recommended = item.recommendedOptions ?? [item.recommendedOption];
  return {
    label: item.label,
    title: item.title,
    body: item.body,
    entries: entries(item).map((entry) => ({
      kind: entry.kind,
      key:
        entry.kind === "option" && form.kind === "round"
          ? (item.options[entry.index]?.key ?? "")
          : "",
      text: entryText(form, item, entry),
      detail: entry.kind === "option" ? (item.options[entry.index]?.detail ?? "") : "",
      isRecommended: entry.kind === "option" && recommended.includes(entry.index),
      isChosen: isChosen(item, answer, entry),
    })),
    start: startEntry(item, answer),
    // What it recommends among its options and why; with no options that is the accept entry.
    recommended: item.options.length ? (item.recommended ?? "") : "",
    isSeveral: answer ? answer.kind === "options" : item.recommendedOptions !== undefined,
    canAccept: canAccept(item),
    accepts:
      item.recommendedOption !== undefined || item.recommendedOptions
        ? said(item, accepted(item))
        : "",
    note: draft.notes[draft.step] ?? "",
    written: answer?.kind === "text" ? answer.text : "",
  };
}

export function view(form: Form, draft: Draft): View {
  return {
    id: formId(form),
    kind: form.kind,
    title: title(form),
    count: form.items.length,
    answered: draft.answers.filter(Boolean).length,
    step: draft.step,
    isReview: isReview(form, draft),
    item: itemView(form, draft),
    review: rowsOf(form, draft).map(({ item, answer, note }) => ({
      label: item.label,
      title: plain(item.title),
      shown: shown(item, answer),
      isAnswered: Boolean(answer),
      note,
    })),
    note: draft.note,
    reply: reply(form, draft),
  };
}

/**
 * A turn ended on `text`. A new round replaces what was held and the same one keeps its
 * answers; a turn that asks nothing leaves it, since a turn a background task woke ends on
 * that task's news while the round still waits.
 */
export function offer(held: Held | null, text: string): Held | null {
  const form = parse(text);
  if (!form || (held && formId(held.form) === formId(form))) return held;
  return { form, draft: newDraft(form) };
}

/**
 * Whether a held round has something to lose: an answer, a per-item note or the round's own.
 * A round with none of them is one a send can drop without setting anything aside.
 */
export function hasWork(held: Held): boolean {
  const { draft } = held;
  return draft.answers.some(Boolean) || draft.notes.some(Boolean) || Boolean(draft.note);
}

/** One action on what is held, when `id` (if given) still names the form showing. */
export function step(held: Held, action: Action, id?: string): Held {
  if (id !== undefined && id !== formId(held.form)) return held;
  const draft = apply(held.form, held.draft, action);
  return draft === held.draft ? held : { ...held, draft };
}

export const viewOf = (held: Held | null): View | null =>
  held ? view(held.form, held.draft) : null;
