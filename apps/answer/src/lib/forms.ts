/**
 * The answer form, with no harness in it: find the question round or pick list a turn ended
 * on, step a draft of answers through it, and write the reply a person would have typed.
 * Pure and JSON-safe, importing only other core files. Reading the message is `parse/`; this file
 * is the form it finds and what happens to it.
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

import { parse } from "./parse/index.ts";

export { parse, split, startLines, tailOf, type Split } from "./parse/index.ts";

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
