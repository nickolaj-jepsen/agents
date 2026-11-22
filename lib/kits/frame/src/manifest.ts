import { defineComponent, no, partial, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "caption-frame",
  name: "Captioned frame",
  purpose:
    "A form between two rules: a caption and Close in the top one, buttons above the bottom one.",
  impl: {
    pi: ["captionFrame", "frameTop", "captionRule", "captionParts"],
    claude: ["captionFrame", "frameTop", "captionRule", "captionParts"],
    gui: ["captionFrame", "frameTop", "captionRule", "captionParts"],
  },
  status: { pi: "system", claude: "system", gui: "system" },
  source: "frame/src/terminal.ts",
  features: [
    {
      id: "title",
      label: "A title in the top rule, Close at the right",
      story: "caption-frame/title",
      pi: yes(),
      claude: yes(),
      gui: partial(
        "a semibold title on the pane's toolbar line, left out where it repeats the host's (`hostTitle`); Close is the host's own, drawn only as the question it asks",
      ),
    },
    {
      id: "rule",
      label:
        "The top rule alone, `captionRule`: a caption after its first cell, a short rule between its parts, a control at its end; what a detail's section rule is",
      story: { pi: "item-detail/rule", claude: "item-detail/rule", gui: "caption-frame/section" },
      pi: yes(),
      claude: yes(),
      gui: yes(
        "a heading: its words, and its end control as a quiet Button at the far edge; no rule line under it, which `expectNative` forbids",
      ),
    },
    {
      id: "steps",
      label: "A caption drawn in the room the rule has, such as the steps of a form",
      story: "caption-frame/steps",
      pi: yes(),
      claude: yes(),
      gui: partial(
        "the caption's spans are text, not controls; pass `head` (such as the card's steps as Buttons) for controls",
      ),
    },
    {
      id: "confirm",
      label: "Close asks before it throws the answers away, in the place it stood",
      story: "caption-frame/confirm",
      pi: yes("Discard and Keep are controls with a `hit` each"),
      claude: yes("Discard and Keep are controls with a `hit` each"),
      gui: yes(
        "the question with a Discard and a Keep Button, both quiet, as the terminal draws them, and the footer quieted too",
      ),
    },
    {
      id: "toolbar-actions",
      label: "The pane's own action at the head's far edge, where a long body scrolls",
      story: "caption-frame/title",
      pi: no("the buttons stand above the bottom rule"),
      claude: no("the buttons stand above the bottom rule"),
      gui: yes(
        "the gui function's `actions` option: Buttons after Close's question, quiet but the lit one; none while Close asks",
      ),
    },
    {
      id: "hover",
      label: "The pointer's control is shown",
      story: "caption-frame/title",
      pi: yes("the control is bold in the text colour; `close.hover` names it"),
      claude: yes(
        "the control sits on a soft fill: the engine inverts it, and the painter swaps its colours first",
      ),
      gui: no("the host draws a Button's hover state itself"),
    },
  ],
});
