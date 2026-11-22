/** The question card's stories. No host imports. */
import { blank } from "../lines.ts";
import type { KitStory } from "../stories.ts";
import type { CardState, ChoiceList, ChoiceListItem, ChoiceListState } from "./contract.ts";
import {
  choice,
  choiceList,
  closing,
  heading,
  note,
  rail,
  sections,
  steps,
  summary,
} from "./terminal.ts";

const QUESTION = "How much of each session should be kept, once the run that made it is over?";

const ITEMS: ChoiceListItem[] = [
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

const card = "card";

export const cardStories: KitStory[] = [
  {
    component: card,
    state: "choices",
    about: "One of many: the chosen answer in the accent with a filled mark",
    settings: "choiceList({chosen: [1]})",
    extreme: true,
    lines: (width) => choiceList({ items: ITEMS, chosen: [1] }, width),
  },
  {
    component: card,
    state: "checkboxes",
    about: "Several of many, the keyboard on an answer that is not chosen",
    settings: "choiceList({multiple: true, chosen: [0, 2], focus: 1})",
    lines: (width) => choiceList({ items: ITEMS, multiple: true, chosen: [0, 2], focus: 1 }, width),
  },
  {
    component: card,
    state: "live",
    about: "Keys and clicks pick; the keyboard's row has a neutral pointer and a bold label",
    settings: "choiceList({chosen: [0], focus: 0}), picked by letter, click or the focused row",
    isLive: true,
    lines: (width) => choiceList(liveChoices, width),
  },
  {
    component: card,
    state: "form",
    about: "A question in a form: its label, then the answers and the note under them",
    settings: "sections(heading, [choiceList({focus: 0}), note])",
    lines: (width) =>
      sections(heading({ active: true, label: "Q1", title: QUESTION }, width), [
        ...choiceList({ items: ITEMS, active: true, chosen: [], focus: 0 }, width),
        ...note({ active: true, value: "" }, width),
      ]),
  },
  {
    component: card,
    state: "transcript",
    about:
      "The same cards behind their rails: the keyboard on one, a green rail by an answered one",
    settings: "rail(sections(heading({focused}), choice..., note))",
    lines: (width) => {
      const inner = width - 3;
      const one = (
        state: { active?: boolean; answered?: boolean },
        label: string,
        chosen: number,
        noted: string,
      ) =>
        sections(heading({ ...state, focused: state.active, label, title: QUESTION }, inner), [
          // A pane on a narrow terminal shows few rows, so the answers here are short ones.
          ...[ITEMS[0], ITEMS[2], ITEMS[3]].flatMap((item, i) =>
            item
              ? choice(
                  {
                    ...state,
                    key: "ABC"[i] ?? "",
                    text: item.text,
                    chosen: i === chosen,
                    literal: item.writeIn,
                  },
                  inner,
                )
              : [],
          ),
          ...note({ ...state, value: noted }, inner),
        ]).map((row) => rail(state, row));
      return [
        ...one({ active: true }, "Q1", -1, ""),
        blank(),
        ...one({ answered: true }, "Q2", 1, "Keep local copies as well"),
      ];
    },
  },
  {
    component: card,
    state: "closing",
    about:
      "The row after a round's last card: the count and Fill prompt, the round's note, and a sent round",
    settings: "rail(closing({answered, total, focused, canFill, hits}), note), closing({sent})",
    lines: (width) => {
      const inner = width - 3;
      const hits = { count: "count", fill: "fill" };
      const behind = (state: CardState, rows: ReturnType<typeof closing>) =>
        rows.map((row) => rail(state, row));
      return [
        ...behind({}, closing({ answered: 0, total: 3, hits }, inner)),
        blank(),
        ...behind({ active: true }, [
          ...closing({ answered: 2, total: 3, focused: true, canFill: true, hits }, inner),
          ...note({ active: true, value: "Ship the 東京 cluster last.", hit: "note" }, inner),
        ]),
        blank(),
        ...behind({ answered: true }, closing({ answered: 3, total: 3, sent: true }, inner)),
      ];
    },
  },
  {
    component: card,
    state: "review",
    about: "The steps of several questions on one row, then each one's answers and note",
    settings: "steps([...]), summary({label, title, values, note})",
    extreme: true,
    lines: (width) => {
      const row = steps(
        [
          { short: "1", name: "Storage", done: true, hit: "step:0" },
          { short: "2", name: "Retention", done: true, hovered: true, hit: "step:1" },
          { short: "Review", current: true, hit: "step:2" },
        ],
        width,
      );
      return sections(
        row ? [row] : [],
        summary(
          { label: "1", title: "Storage", values: [{ text: "Postgres beside the app" }] },
          width,
        ),
        summary(
          {
            label: "2",
            title: "Retention",
            values: [
              { text: "The last turn only" },
              { text: "Until the disk fills", literal: true },
            ],
            note: "履歴は保存されますが、古い出力は要約されます。",
          },
          width,
        ),
        summary({ label: "3", title: "Backups", values: [], hovered: true }, width),
      );
    },
  },
];
