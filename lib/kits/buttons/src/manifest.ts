import { defineComponent } from "@agents/kit-core/manifest.ts";
import { buttonsFields, buttonsNeeds } from "./contract.ts";

export default defineComponent({
  schema: 2,
  id: "button-row",
  name: "Button row",
  purpose:
    "A row of actions with their keys, the suggested one in the accent, and keyboard-only hints.",
  contract: { fields: buttonsFields, needs: buttonsNeeds },
  parts: {
    buttonRow: {},
    buttonRows: {
      drawings: ["terminal"],
      none: { gui: "`buttonRow` draws every row of the footer" },
    },
  },
  features: [
    {
      id: "row",
      label: "Actions label first, the suggested one in the accent; a keyboard-only hint is dim",
      fields: ["rows"],
      story: "button-row/row",
    },
    {
      id: "lit",
      label: "One button of a screen is lit, and none while Close asks, which quiets every control",
      fields: ["confirming"],
      story: "button-row/confirm",
    },
    {
      id: "footer",
      label: "A footer of several rows, each starting at the same edge",
      fields: ["rows"],
      story: "button-row/rows",
    },
    {
      id: "chosen",
      label:
        "What the screen is set to among buttons that set it: a check before its label, never filled",
      fields: ["rows"],
      needs: ["cells:false"],
      story: "button-row/chosen",
    },
    {
      id: "flush",
      label: "A row in a panel or another block that has its own inset: none of its own",
      fields: ["isFlush"],
      needs: ["cells:false"],
      story: "button-row/chosen",
    },
    {
      id: "fit",
      label: "A row with no room drops what is neither suggested nor essential, last first",
      needs: ["cells"],
      story: "button-row/fit",
    },
    {
      id: "wrap",
      label: "A wrapped row drops nothing",
      fields: ["wrap"],
      needs: ["cells"],
      story: "button-row/wrap",
    },
    {
      id: "lead",
      label: "Words before the first entry, such as progress: not a control",
      fields: ["lead"],
      story: "button-row/wrap",
    },
    {
      id: "hover",
      label: "The pointer's control is shown",
      fields: ["hover"],
      needs: ["hover:kit|painter"],
      story: "button-row/row",
      limits: { pi: "the label is bold in the text colour; `hover` gives the cell" },
    },
  ],
} as const);
