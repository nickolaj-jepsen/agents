/**
 * The question card's contract: what both clients pass to its parts, and the intents a list of
 * choices sends back. No host imports.
 */

/**
 * The state every part of one card shares. A card looks the same wherever it is drawn: in a
 * form, or as one of several in a transcript.
 */
export type CardState = {
  /** The card the keyboard is on: its rail is bright. */
  active?: boolean;
  /** The card has its answer: its heading ends in a tick, wherever the keyboard is. */
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
};

export type Note = CardState & {
  /** What the person wrote; empty shows the invitation to add one. */
  value: string;
  focused?: boolean;
  hovered?: boolean;
  /** Rows it may take. */
  max?: number;
  hit?: string;
};

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
