import { defineComponent } from "@agents/kit-core/manifest.ts";
import { frameFields, frameNeeds } from "./contract.ts";

export default defineComponent({
  schema: 2,
  id: "caption-frame",
  name: "Captioned frame",
  purpose:
    "A form between two rules: a caption and Close in the top one, buttons above the bottom one.",
  contract: { fields: frameFields, needs: frameNeeds },
  parts: {
    captionFrame: {},
    frameTop: {},
    captionRule: {},
    captionParts: {},
    captionRoom: {
      drawings: ["terminal"],
      none: { gui: "no rule has a room to measure: the host lays the toolbar line out" },
    },
    closeSpans: {
      drawings: ["terminal"],
      none: { gui: "Close is the host's; the question it asks is drawn by `frameTop`" },
    },
  },
  features: [
    {
      id: "title",
      label: "A title in the top rule, Close at the right",
      fields: ["title", "body"],
      story: "caption-frame/title",
    },
    {
      id: "layout",
      label: "Laid out in cells, to the width it is given",
      fields: ["width"],
      needs: ["cells"],
      story: "caption-frame/title",
    },
    {
      id: "rule",
      label:
        "The top rule alone, `captionRule`: a caption after its first cell, a short rule between its parts, a control at its end; what a detail's section rule is",
      fields: ["end"],
      story: "caption-frame/section",
    },
    {
      id: "steps",
      label: "A caption drawn in the room the rule has, such as the steps of a form",
      fields: ["caption"],
      story: "caption-frame/steps",
      limits: {
        vscode: "the caption's spans are text, not controls; pass `head` for controls",
        desktop: "the caption's spans are text, not controls; pass `head` for controls",
        mobile: "the caption's spans are text, not controls; pass `head` for controls",
      },
    },
    {
      id: "confirm",
      label: "Close asks before it throws the answers away, in the place it stood",
      fields: ["close"],
      story: "caption-frame/confirm",
    },
    {
      id: "footer",
      label: "Buttons above the bottom rule, and a notice above them",
      fields: ["footer", "notice"],
      story: "caption-frame/title",
    },
    {
      id: "host-title",
      label: "The pane's own title, left out where the head would repeat it",
      fields: ["hostTitle"],
      needs: ["cells:false"],
      story: "caption-frame/title",
    },
    {
      id: "toolbar-actions",
      label:
        "The pane's own action at the head's far edge, where a long body scrolls; or the head's words as elements",
      fields: ["actions", "head"],
      needs: ["cells:false"],
      story: "caption-frame/title",
    },
    {
      id: "hover",
      label: "The pointer's control is shown",
      needs: ["hover:kit|painter"],
      story: "caption-frame/title",
      limits: { pi: "the control is bold in the text colour; `close.hover` names it" },
    },
  ],
} as const);
