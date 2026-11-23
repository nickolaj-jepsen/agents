/**
 * The question card's contract: its model, what each drawing is given, and the intents a list of
 * choices sends back. No host imports.
 */
import { modelFields } from "@agents/kit-core/manifest.ts";

/**
 * What a write-in's or a note's field is given on a graphical surface (where there is an
 * `Input`): the words it invites, whether it takes the focus when it is drawn, and, for a host
 * whose field is one line (VS Code), `lines`: one field per line of the text. Events go to the
 * context (`g.input(hit, text)`, `g.submit(hit, text)`); the field of a line after the first is
 * the hit `lineHit(hit, i)`.
 */
export type FieldProps = {
  /**
   * A write-in whose text is this one is empty, showing it as the placeholder; a note shows it
   * as its own. @default "Write your own answer", and "Add a note" for a note
   */
  invitation?: string;
  /** The first field takes the focus when it is drawn: a field the person just asked for. */
  autoFocus?: boolean;
  /** One field per line of its text, at least this many, the later ones placeheld `Line 2`. */
  lines?: number;
  /** Rows a field has where the host's wraps what is typed. @default 1 */
  rows?: number;
};

/** The hit of the `line`th field of a write-in or a note that is one field per line. */
export const lineHit = (hit: string, line: number) => (line ? `${hit}#${line}` : hit);

/** A field's hit and its line, from what `g.input` or `g.submit` was given. */
export function lineOf(hit: string): { hit: string; line: number } {
  const at = hit.lastIndexOf("#");
  const line = at < 0 ? NaN : Number(hit.slice(at + 1));
  return Number.isInteger(line) ? { hit: hit.slice(0, at), line } : { hit, line: 0 };
}

/**
 * The state every part of one card shares. A card looks the same wherever it is drawn: in a
 * form, or as one of several in a transcript.
 */
export type CardState = {
  /** The card the keyboard is on: its label and its answers' letters are in the accent. */
  active?: boolean;
  /** The card has its answer: its rail is in the success colour, wherever the keyboard is. */
  answered?: boolean;
};

export type Heading = CardState & {
  /** Inline Markdown. */
  title: string;
  /** The question's short name, such as `Q1`. */
  label?: string;
  /**
   * The keyboard is on this card and on none of its rows, as where letters pick an answer
   * directly: the pointer stands on the heading.
   */
  focused?: boolean;
};

export type Choice = CardState & {
  /** The letter that picks it. */
  key: string;
  /** Inline Markdown, unless `literal`. */
  text: string;
  /** Dim lines under the label, inline Markdown. */
  detail?: string;
  /** Rows the detail may take. @default 3 */
  detailLines?: number;
  /** Dim words after the label, wrapped with it: that it is the recommended answer. */
  aside?: string;
  chosen?: boolean;
  /** The keyboard's row, whatever is chosen: it takes the pointer. */
  focused?: boolean;
  /** The row under the mouse: bold as the keyboard's is, without the pointer. */
  hovered?: boolean;
  /** Several of many (`□ ■`) instead of one of many (`○ ●`). */
  multiple?: boolean;
  /** The person's own words, not Markdown: a write-in. */
  literal?: boolean;
  /** The control its rows belong to. */
  hit?: string;
} & FieldProps;

export type Note = CardState & {
  /** What the person wrote; empty shows the invitation to add one. */
  value: string;
  focused?: boolean;
  hovered?: boolean;
  /** Rows it may take. */
  max?: number;
  hit?: string;
} & FieldProps;

export type Step = {
  /** Kept when names do not fit: the step's number, or `Review`. */
  short: string;
  /** A numbered step's name. An action such as Review has none, and no mark. */
  name?: string;
  current?: boolean;
  hovered?: boolean;
  done?: boolean;
  /** The control it is. */
  hit?: string;
};

export type Summary = {
  /** Short identifier, kept to the left of the question and its answers. */
  label: string;
  title: string;
  /** Preset answers may hold inline Markdown; a write-in is literal. */
  values: readonly { text: string; literal?: boolean }[];
  note?: string;
  hovered?: boolean;
  hit?: string;
};

/**
 * The row after a round's last card: how many questions have an answer, and the way to send
 * them on. Its note, the whole round's, is a `note` under it.
 */
export type Closing = {
  /** Questions with an answer. */
  answered: number;
  /** Questions in the round. */
  total: number;
  /** The keyboard is on this step: the pointer stands on the row and the count is bold. */
  focused?: boolean;
  /** The control under the mouse. */
  hovered?: "count" | "fill";
  /** There is a reply to fill the prompt with: Fill prompt is the suggested action. */
  canFill?: boolean;
  /** The round was sent: the row says so. */
  sent?: boolean;
  /**
   * The controls' ids: the count, which goes to the first question, and Fill prompt. Without
   * them the row is only the count, for a round that can no longer be answered.
   */
  hits?: { count: string; fill: string };
};

/**
 * The card's model: what a screen of questions says, and what its view model decides from.
 * A card is a heading, its choices and a note; a round of several adds steps, a summary of each
 * answer and a closing row.
 */
export type Card = {
  heading?: Heading;
  choices?: readonly Choice[];
  note?: Note;
  steps?: readonly Step[];
  summaries?: readonly Summary[];
  closing?: Closing;
  /** The room in cells. */
  width: number;
};

/** The capability each gated field needs. The rest of the model is for every surface. */
export const cardNeeds = { width: "cells" } as const;

export const cardFields = modelFields<Card>()([
  "heading",
  "choices",
  "note",
  "steps",
  "summaries",
  "closing",
  "width",
]);

export type ChoiceListItem = {
  key: string;
  text: string;
  detail?: string;
  /** The person's own words instead of a preset answer. */
  writeIn?: boolean;
};

export type ChoiceListState = {
  /** Indexes of the chosen items. */
  chosen: number[];
  /** The row the keyboard is on. */
  focus?: number;
};

export type ChoiceList = ChoiceListState & {
  items: ChoiceListItem[];
  /** The keyboard is on this list's card: the letters are in the accent. */
  active?: boolean;
  /** Several of many instead of one of many. */
  multiple?: boolean;
  /**
   * The row under the pointer, where the client reports it: drawn as the keyboard's row is,
   * less the pointer. Claude Code's engine styles its own hover and reports none.
   */
  hover?: number;
};

export type ChoiceIntent =
  | { do: "move"; by: number }
  /** Picks the item at `index`, or the focused one. */
  | { do: "pick"; index?: number };

/** The row id of a list's item, as a drawn line's `hit`. */
export const choiceHit = (index: number) => `choice:${index}`;

/** The item a `hit` names, or -1. */
export const choiceOf = (hit: string | undefined) =>
  hit?.startsWith("choice:") ? Number(hit.slice(7)) : -1;

/** The intent a letter stands for: the item with that key. */
export function choiceKey(items: ChoiceListItem[], key: string): ChoiceIntent | undefined {
  const index = items.findIndex((item) => item.key.toLowerCase() === key.toLowerCase());
  return index < 0 ? undefined : { do: "pick", index };
}

export function choiceReduce(
  state: ChoiceListState,
  intent: ChoiceIntent,
  props: Pick<ChoiceList, "items" | "multiple">,
): ChoiceListState {
  const count = props.items.length;
  if (count === 0) return state;
  if (intent.do === "move") {
    const from = state.focus ?? (intent.by > 0 ? -1 : 0);
    return { ...state, focus: (((from + intent.by) % count) + count) % count };
  }
  const index = intent.index ?? state.focus;
  if (index === undefined || index < 0 || index >= count) return state;
  const focus = state.focus === undefined ? undefined : index;
  if (!props.multiple) return { chosen: [index], focus };
  const chosen = state.chosen.includes(index)
    ? state.chosen.filter((i) => i !== index)
    : [...state.chosen, index].sort((a, b) => a - b);
  return { chosen, focus };
}

/** A digit picks by a row's place, not by the letter printed on it. */
export function digitChoice(key: string): number {
  return /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
}
