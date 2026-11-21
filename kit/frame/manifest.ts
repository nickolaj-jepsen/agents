import { defineComponent, yes } from "../catalog/manifest.ts";

export default defineComponent({
  id: "caption-frame",
  name: "Captioned frame",
  purpose:
    "A form between two rules: a caption and Close in the top one, buttons above the bottom one.",
  impl: { pi: "captionFrame", claude: "captionFrame" },
  status: { pi: "system", claude: "system", gui: "legacy" },
  source: "frame/terminal.ts",
  features: [
    {
      id: "title",
      label: "A title in the top rule, Close at the right",
      story: "caption-frame/title",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "steps",
      label: "A caption drawn in the room the rule has, such as the steps of a form",
      story: "caption-frame/steps",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "confirm",
      label: "Close asks before it throws the answers away, in the place it stood",
      story: "caption-frame/confirm",
      pi: yes("Discard and Keep are controls with a `hit` each"),
      claude: yes("Discard and Keep are controls with a `hit` each"),
    },
    {
      id: "hover",
      label: "The pointer's control is shown",
      story: "caption-frame/title",
      pi: yes("the control is bold in the text colour; `close.hover` names it"),
      claude: yes(
        "the control sits on a soft fill: the engine inverts it, and the painter swaps its colours first",
      ),
    },
  ],
});
