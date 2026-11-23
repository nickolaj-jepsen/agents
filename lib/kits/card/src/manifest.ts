import { defineComponent } from "@agents/kit-core/manifest.ts";
import { cardFields, cardNeeds } from "./contract.ts";

const none = (why: string) => ({ drawings: ["terminal"] as const, none: { gui: why } });

export default defineComponent({
  schema: 2,
  id: "card",
  name: "Question card",
  purpose:
    "A question with lettered answers and a note, and the steps and summary of a form of several.",
  contract: { fields: cardFields, needs: cardNeeds },
  parts: {
    heading: {},
    choice: {},
    choiceList: {},
    note: {},
    steps: {},
    summary: {},
    closing: {},
    sections: {},
    choices: {
      drawings: ["gui"],
      none: { terminal: "a terminal draws each row itself, and `rail` draws the rail beside it" },
    },
    rail: none("a graphical card's rail is drawn by `choices`, beside the answers"),
    railRole: none("a graphical card's rail is a quiet rule, or the success colour"),
    controlStyle: none("a graphical control is a Button, which the host styles"),
    CARD_INSET: none("a graphical row has no pointer column"),
    NOTE_LABEL: none("a graphical note is a panel with its own caption"),
    sectionsOf: none("a graphical card sets its sections in a column; `sections`"),
  },
  features: [
    {
      id: "choices",
      label: "One of many: the chosen answer in the accent with a filled mark",
      fields: ["choices", "width"],
      needs: ["cells"],
      story: "card/choices",
    },
    {
      id: "icons",
      label:
        "A row's mark is an icon (open, chosen) before the key's Button, and the answers stand behind a rail that ties them together",
      needs: ["cells:false"],
      story: "card/choices",
    },
    {
      id: "checkboxes",
      label: "Several of many, with the keyboard's row marked apart from the chosen ones",
      story: "card/checkboxes",
    },
    {
      id: "write-in",
      label: "A write-in row for the person's own words",
      needs: ["input"],
      story: "card/choices",
      limits: {
        pi: "the client's field takes the row, which wraps what is typed",
        "claude-terminal": "the engine's field stands alone on its rows, which wrap what is typed",
      },
    },
    {
      id: "fields",
      label: "A write-in and a note written in place, the note in a panel with a full-width field",
      fields: ["note"],
      needs: ["input"],
      story: "card/fields",
      limits: {
        vscode: "the host's field is one line: one per line of the text, the later ones placeheld",
      },
    },
    {
      id: "pointer-hover",
      label: "The row under the pointer is shown",
      needs: ["hover:kit|painter"],
      story: "card/live",
    },
    {
      id: "form",
      label: "A question in a form: label, answers and note, a blank row between",
      fields: ["heading"],
      story: "card/form",
    },
    {
      id: "transcript",
      label: "Cards in a transcript: the keyboard's, and one that has its answer",
      needs: ["cells"],
      story: "card/transcript",
      limits: {
        "claude-terminal": "the rail is the engine's quote border, which the kit does not draw",
      },
    },
    {
      id: "review",
      label:
        "Steps of several questions on one row, the current one a label, then each answer in a label column and its note",
      fields: ["steps", "summaries"],
      story: "card/review",
    },
    {
      id: "closing",
      label:
        "A round's closing row: the count goes to the first question, Fill prompt is suggested once there is a reply",
      fields: ["closing"],
      story: "card/closing",
      limits: {
        "claude-terminal": "the rail is the engine's quote border, which the kit does not draw",
      },
    },
    {
      id: "live",
      label: "Keys and clicks pick an answer",
      story: "card/live",
    },
  ],
} as const);
