import { defineComponent, partial, yes } from "../catalog/manifest.ts";

const parts = ["heading", "choice", "choiceList", "note", "steps", "summary", "rail", "sections"];

export default defineComponent({
  id: "card",
  name: "Question card",
  purpose:
    "A question with lettered answers and a note, and the steps and summary of a form of several.",
  impl: { pi: parts, claude: parts },
  status: { pi: "system", claude: "system", gui: "legacy" },
  source: "card/terminal.ts",
  features: [
    {
      id: "choices",
      label: "One of many: the chosen answer in the accent with a filled mark",
      story: "card/choices",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "checkboxes",
      label: "Several of many, with the keyboard's row marked apart from the chosen ones",
      story: "card/checkboxes",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "write-in",
      label: "A write-in row for the person's own words",
      story: "card/choices",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "pointer-hover",
      label: "The row under the pointer is shown",
      story: "card/live",
      pi: yes("the row is bold, like the keyboard's, without its pointer"),
      claude: yes(
        "the control sits on a soft fill: the engine inverts it, and the painter swaps its colours first",
      ),
    },
    {
      id: "form",
      label: "A question in a form: label, answers and note, a blank row between",
      story: "card/form",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "transcript",
      label: "Cards in a transcript: the keyboard's, and one that has its answer",
      story: "card/transcript",
      pi: yes("the kit draws the rail beside each row"),
      claude: partial("the rail is the engine's quote border, which the kit does not draw"),
    },
    {
      id: "review",
      label: "Steps of several questions on one row, then each answer and its note",
      story: "card/review",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "live",
      label: "Keys and clicks pick an answer",
      story: "card/live",
      pi: yes("the client wires keys and the mouse to `choiceReduce`"),
      claude: yes("the client wires keys and clicks to `choiceReduce`"),
    },
  ],
});
