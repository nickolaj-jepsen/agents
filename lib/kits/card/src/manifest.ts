import { defineComponent, no, partial, yes } from "@agents/kit-core/manifest.ts";

const parts = [
  "heading",
  "choice",
  "choiceList",
  "note",
  "steps",
  "summary",
  "closing",
  "rail",
  "sections",
];

export default defineComponent({
  id: "card",
  name: "Question card",
  purpose:
    "A question with lettered answers and a note, and the steps and summary of a form of several.",
  impl: {
    pi: parts,
    claude: parts,
    gui: ["heading", "choice", "choiceList", "note", "steps", "summary", "closing", "sections"],
  },
  status: { pi: "system", claude: "system", gui: "system" },
  source: "card/src/terminal.ts",
  features: [
    {
      id: "choices",
      label: "One of many: the chosen answer in the accent with a filled mark",
      story: "card/choices",
      pi: yes(),
      claude: yes(),
      gui: yes(
        "a Button of the letter, filled when chosen, in a lead column; the words wrap beside it",
      ),
    },
    {
      id: "checkboxes",
      label: "Several of many, with the keyboard's row marked apart from the chosen ones",
      story: "card/checkboxes",
      pi: yes(),
      claude: yes(),
      gui: yes("the same rows; pressing toggles, and a chosen letter is filled"),
    },
    {
      id: "write-in",
      label: "A write-in row for the person's own words",
      story: "card/choices",
      pi: yes(),
      claude: yes(),
      gui: yes("the host's Input in place of the words"),
    },
    {
      id: "fields",
      label: "A write-in and a note written in place",
      story: "card/fields",
      pi: yes("the client's field takes the row, which wraps what is typed"),
      claude: yes("the engine's field stands alone on its rows, which wrap what is typed"),
      gui: yes(
        "the host's Input; where it is one line (VS Code), one per line of the text, the later ones placeheld Line 2, Line 3",
      ),
    },
    {
      id: "pointer-hover",
      label: "The row under the pointer is shown",
      story: "card/live",
      pi: yes("the row is bold, like the keyboard's, without its pointer"),
      claude: yes(
        "the control sits on a soft fill: the engine inverts it, and the painter swaps its colours first",
      ),
      gui: no("the host draws its own hover on a Button"),
    },
    {
      id: "form",
      label: "A question in a form: label, answers and note, a blank row between",
      story: "card/form",
      pi: yes(),
      claude: yes(),
      gui: yes(
        "the sections are a column with a small gap; an answered heading ends in a success tick, a recommended answer's aside follows its label",
      ),
    },
    {
      id: "transcript",
      label: "Cards in a transcript: the keyboard's, and one that has its answer",
      story: "card/transcript",
      pi: yes("the kit draws the rail beside each row"),
      claude: partial("the rail is the engine's quote border, which the kit does not draw"),
      gui: no("the surface draws no rail; a chosen letter and the steps say the state"),
    },
    {
      id: "review",
      label: "Steps of several questions on one row, then each answer and its note",
      story: "card/review",
      pi: yes(),
      claude: yes(),
      gui: yes("steps are tabs, a done one with a tick; each answer is a title and its values"),
    },
    {
      id: "closing",
      label:
        "A round's closing row: the count goes to the first question, Fill prompt is suggested once there is a reply",
      story: "card/closing",
      pi: yes("the kit draws the rail beside the row"),
      claude: partial("the rail is the engine's quote border, which the kit does not draw"),
      gui: yes("the count and Fill prompt are Buttons, Fill filled once there is a reply"),
    },
    {
      id: "live",
      label: "Keys and clicks pick an answer",
      story: "card/live",
      pi: yes("the client wires keys and the mouse to `choiceReduce`"),
      claude: yes("the client wires keys and clicks to `choiceReduce`"),
      gui: yes("a press on a letter calls `press` with its `choice:<i>` hit"),
    },
  ],
});
