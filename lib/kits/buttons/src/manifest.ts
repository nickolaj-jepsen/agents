import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "button-row",
  name: "Button row",
  purpose:
    "A row of actions with their keys, the suggested one in the accent, and keyboard-only hints.",
  impl: { pi: "buttonRow", claude: "buttonRow", gui: "buttonRow" },
  status: { pi: "system", claude: "system", gui: "system" },
  source: "buttons/src/terminal.ts",
  features: [
    {
      id: "row",
      label: "Actions label first, the suggested one in the accent; a keyboard-only hint is dim",
      story: "button-row/row",
      pi: yes("an action's label and key carry its `hit`; a hint carries none"),
      claude: yes("an action's label and key carry its `hit`; a hint carries none"),
      gui: yes(
        "a Button per action with a `hit`, the suggested one filled and the rest quiet; a hint has no key to show and is not drawn",
      ),
    },
    {
      id: "fit",
      label: "A row with no room drops what is neither suggested nor essential, last first",
      story: "button-row/fit",
      pi: yes(),
      claude: yes(),
      gui: no("the host wraps the row, so no entry is ever dropped"),
    },
    {
      id: "wrap",
      label: "A wrapped row drops nothing; words before the first entry are not a control",
      story: "button-row/wrap",
      pi: yes(),
      claude: yes(),
      gui: yes("the host wraps whole Buttons; `lead` is text before the first"),
    },
    {
      id: "literal",
      label: "A label that is a word to insert, whose case is kept",
      story: "button-row/row",
      pi: yes("labels are never changed"),
      claude: yes("labels are never changed"),
      gui: yes("with `isLiteral` the label keeps its case; otherwise it is capitalised"),
    },
    {
      id: "bind",
      label: "A key that does what the button does, while the row is shown",
      story: "button-row/row",
      pi: yes("the caller owns the binding; the key is drawn dim after the label"),
      claude: yes("the caller owns the binding; the key is drawn dim after the label"),
      gui: no(
        "the VS Code webview does not act on a native Button's `hotkey` (checked live), so the button is pressed by a click or the focus ring",
      ),
    },
    {
      id: "hover",
      label: "The pointer's control is shown",
      story: "button-row/row",
      pi: yes("the label is bold in the text colour; `hover` gives the cell"),
      claude: yes(
        "the control sits on a soft fill: the engine inverts it, and the painter swaps its colours first",
      ),
      gui: no("the host draws a Button's hover state itself"),
    },
  ],
});
