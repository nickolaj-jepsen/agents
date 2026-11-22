import { defineComponent, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "button-row",
  name: "Button row",
  purpose:
    "A row of actions with their keys, the suggested one in the accent, and keyboard-only hints.",
  impl: { pi: "buttonRow", claude: "buttonRow" },
  status: { pi: "system", claude: "system", gui: "legacy" },
  source: "buttons/src/terminal.ts",
  features: [
    {
      id: "row",
      label: "Actions label first, the suggested one in the accent; a keyboard-only hint is dim",
      story: "button-row/row",
      pi: yes("an action's label and key carry its `hit`; a hint carries none"),
      claude: yes("an action's label and key carry its `hit`; a hint carries none"),
    },
    {
      id: "fit",
      label: "A row with no room drops what is neither suggested nor essential, last first",
      story: "button-row/fit",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "wrap",
      label: "A wrapped row drops nothing; words before the first entry are not a control",
      story: "button-row/wrap",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "hover",
      label: "The pointer's control is shown",
      story: "button-row/row",
      pi: yes("the label is bold in the text colour; `hover` gives the cell"),
      claude: yes(
        "the control sits on a soft fill: the engine inverts it, and the painter swaps its colours first",
      ),
    },
  ],
});
