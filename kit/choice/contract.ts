/** The choice list's contract: what both clients pass in and the intents they send back. */

export type ChoiceItem = {
  /** The letter that picks it. */
  key: string;
  text: string;
  /** Dim lines under the label. */
  detail?: string;
  /** The person's own words instead of a preset answer: dim until chosen. */
  writeIn?: boolean;
};

export type ChoiceState = {
  /** Indexes of the chosen items. */
  chosen: number[];
  /** The row the keyboard is on, where the client draws its own focus; absent where the host does. */
  focus?: number;
};

export type ChoiceProps = ChoiceState & {
  items: ChoiceItem[];
  /** Several of many (`□ ■`) instead of one of many (`○ ●`). */
  multiple?: boolean;
};

export type ChoiceIntent =
  | { do: "move"; by: number }
  /** Picks the item at `index`, or the focused one. */
  | { do: "pick"; index?: number };

/** The row id of an item, as a drawn line's `hit`. */
export const choiceHit = (index: number) => `choice:${index}`;

/** The item a `hit` names, or -1. */
export const choiceOf = (hit: string | undefined) =>
  hit?.startsWith("choice:") ? Number(hit.slice(7)) : -1;

/** The intent a letter stands for: the item with that key. */
export function choiceKey(items: ChoiceItem[], key: string): ChoiceIntent | undefined {
  const index = items.findIndex((item) => item.key.toLowerCase() === key.toLowerCase());
  return index < 0 ? undefined : { do: "pick", index };
}

export function choiceReduce(
  state: ChoiceState,
  intent: ChoiceIntent,
  props: Pick<ChoiceProps, "items" | "multiple">,
): ChoiceState {
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
