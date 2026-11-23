/** The question card's stories: the model as data, and what each drawing adds. No host imports. */
import type { StageExt, Story } from "@agents/kit-core/stories.ts";
import type { Choice, ChoiceList, ChoiceListItem, ChoiceListState } from "./contract.ts";
import type { CardModel } from "./model.ts";

export const QUESTION =
  "How much of each session should be kept, once the run that made it is over?";

export const ITEMS: ChoiceListItem[] = [
  { key: "A", text: "The whole transcript" },
  {
    key: "B",
    text: "The last turn only, which is the part most people read back when a run went wrong and they want to see why",
    detail: "履歴は保存されますが、古い出力は要約されます。 Older output is summarised.",
  },
  { key: "C", text: "A `summary` of **each** run" },
  { key: "D", text: "Write your own answer", writeIn: true },
];

/** The list the live story starts from, and what each catalogue's wiring changes. */
export const liveChoices: ChoiceList = {
  items: ITEMS.slice(0, 3),
  active: true,
  chosen: [0],
  focus: 0,
};

/** A live choice story's first state. */
export const liveStart = (): ChoiceListState => ({ chosen: liveChoices.chosen, focus: 0 });

/** What a form's write-in and note hold once written, for the story of fields in place. */
export const WRITTEN = {
  answer: "Use the existing schema.",
  note: "Rotate the credentials first.",
};

/** The answers as the model's rows. */
const choicesOf = (items: readonly ChoiceListItem[], rest: Partial<Choice> = {}): Choice[] =>
  items.map((item) => ({
    key: item.key,
    text: item.text,
    detail: item.detail,
    literal: item.writeIn,
    ...rest,
  }));

/** What the terminal adds: the card's state, and the stage. `chosen` and `focus` are rows' places. */
export type TerminalExt = StageExt & {
  active?: true;
  chosen?: readonly number[];
  focus?: number;
  /** Two cards behind their rails: the keyboard's, and one that has its answer. */
  cards?: readonly { state: "active" | "answered"; label: string; chosen: number; note: string }[];
};

const card = "card";

export const cardStories: Story<CardModel, TerminalExt>[] = [
  {
    component: card,
    state: "choices",
    about: "One of many: the chosen answer in the accent with a filled mark",
    settings: "choiceList({chosen: [1]})",
    model: { choices: choicesOf(ITEMS).map((c, i) => ({ ...c, chosen: i === 1 })) },
    ext: { terminal: { extreme: true, chosen: [1] } },
  },
  {
    component: card,
    state: "checkboxes",
    about: "Several of many, the keyboard on an answer that is not chosen",
    settings: "choiceList({multiple: true, chosen: [0, 2], focus: 1})",
    model: {
      choices: choicesOf(ITEMS, { multiple: true }).map((c, i) => ({
        ...c,
        chosen: i === 0 || i === 2,
        focused: i === 1,
      })),
    },
    ext: { terminal: { chosen: [0, 2], focus: 1 } },
  },
  {
    component: card,
    state: "live",
    about: "Keys and clicks pick; the keyboard's row has a neutral pointer and a bold label",
    settings: "choiceList({chosen: [0], focus: 0}), picked by letter, click or the focused row",
    isLive: true,
    model: {
      choices: choicesOf(liveChoices.items).map((c, i) => ({
        ...c,
        chosen: i === 0,
        focused: i === 0,
      })),
    },
    ext: { terminal: { active: true, chosen: [0], focus: 0 } },
  },
  {
    component: card,
    state: "form",
    about: "A question in a form: its label, then the answers and the note under them",
    settings: "sections(heading, [choiceList({focus: 0}), note])",
    model: {
      heading: { label: "Q1", title: QUESTION, answered: true },
      choices: choicesOf(ITEMS).map((c, i) =>
        i === 0 ? { ...c, aside: "Recommended", chosen: true } : c,
      ),
      note: { value: "" },
    },
    ext: { terminal: { active: true, chosen: [], focus: 0 } },
  },
  {
    component: card,
    state: "fields",
    about:
      "A write-in and a note written in place: one field each, or one per line where the host's field is one line",
    settings: "sections(choice({literal, chosen}), note({value}))",
    model: {
      choices: [
        {
          key: "D",
          text: WRITTEN.answer,
          literal: true,
          chosen: true,
          hit: "write",
          lines: 2,
          invitation: "Type an answer",
        },
      ],
      note: { value: WRITTEN.note, hit: "note", lines: 2, invitation: "Type a note" },
    },
    ext: { terminal: { active: true } },
  },
  {
    component: card,
    state: "transcript",
    about:
      "The same cards behind their rails: the keyboard on one, a green rail by an answered one",
    settings: "rail(sections(heading({focused}), choice..., note))",
    model: {
      heading: { title: QUESTION },
      choices: choicesOf([ITEMS[0], ITEMS[2], ITEMS[3]].flatMap((i) => (i ? [i] : []))),
    },
    ext: {
      terminal: {
        cards: [
          { state: "active", label: "Q1", chosen: -1, note: "" },
          { state: "answered", label: "Q2", chosen: 1, note: "Keep local copies as well" },
        ],
      },
    },
  },
  {
    component: card,
    state: "closing",
    about:
      "The row after a round's last card: the count and Fill prompt, the round's note, and a sent round",
    settings: "rail(closing({answered, total, focused, canFill, hits}), note), closing({sent})",
    model: {
      closing: { answered: 2, total: 3, canFill: true, hits: { count: "count", fill: "fill" } },
      note: { value: "Ship the 東京 cluster last.", hit: "note" },
    },
  },
  {
    component: card,
    state: "review",
    about: "The steps of several questions on one row, then each one's answers and note",
    settings: "steps([...]), summary({label, title, values, note})",
    model: {
      steps: [
        { short: "1", name: "Storage", done: true, hit: "step:0" },
        { short: "2", name: "Retention", done: true, hovered: true, hit: "step:1" },
        { short: "Review", current: true, hit: "step:2" },
      ],
      summaries: [
        {
          label: "1",
          title: "Storage",
          values: [{ text: "Postgres beside the app" }],
          hit: "summary:0",
        },
        {
          label: "2",
          title: "Retention",
          values: [{ text: "The last turn only" }, { text: "Until the disk fills", literal: true }],
          note: "履歴は保存されますが、古い出力は要約されます。",
          hit: "summary:1",
        },
        { label: "3", title: "Backups", values: [], hovered: true, hit: "summary:2" },
      ],
    },
    ext: { terminal: { extreme: true } },
  },
];
