/** The choice list's stories: one set of props, drawn by both catalogues. No host imports. */
import type { ChoiceItem, ChoiceProps } from "./contract.ts";

const ITEMS: ChoiceItem[] = [
  { key: "A", text: "The whole transcript" },
  {
    key: "B",
    text: "The last turn only, which is the part most people read back when a run went wrong and they want to see why",
    detail: "履歴は保存されますが、古い出力は要約されます。 Older output is summarised.",
  },
  { key: "C", text: "A summary of each run" },
  { key: "D", text: "Write your own answer", writeIn: true },
];

export type ChoiceStory = {
  state: string;
  about: string;
  settings: string;
  props: ChoiceProps;
  /** Keys and clicks change it. */
  live?: boolean;
  extreme?: boolean;
};

export const choiceStories: ChoiceStory[] = [
  {
    state: "single",
    about: "One of many: the chosen answer in the accent with a filled mark",
    settings: "{chosen: [1]}",
    props: { items: ITEMS, chosen: [1] },
    extreme: true,
  },
  {
    state: "multiple",
    about: "Several of many, with square marks",
    settings: "{multiple: true, chosen: [0, 2]}",
    props: { items: ITEMS, multiple: true, chosen: [0, 2] },
  },
  {
    state: "live",
    about: "Keys and clicks pick; where the client draws focus, a neutral pointer and a bold label",
    settings: "{chosen: [0]}, picked by letter, click or the focused row",
    props: { items: ITEMS.slice(0, 3), chosen: [0] },
    live: true,
  },
];
