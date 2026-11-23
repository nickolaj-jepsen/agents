import { defineComponent } from "@agents/kit-core/manifest.ts";
import { statusBandFields, statusBandNeeds } from "./contract.ts";

export default defineComponent({
  schema: 2,
  id: "status-band",
  name: "Status band",
  purpose:
    "The one line above the prompt that says there is something to open: a status mark and the text, then a way in and further actions.",
  contract: { fields: statusBandFields, needs: statusBandNeeds },
  parts: { statusBand: {} },
  features: [
    {
      id: "line",
      label: "A status mark and the text, the hint dim; the whole line is the way in",
      fields: ["text", "hint", "hit"],
      story: "status-band/default",
    },
    {
      id: "status",
      label: "Warning, error and success, only for an actual state",
      fields: ["status"],
      story: "status-band/error",
    },
    {
      id: "cut",
      label: "The text is cut so the hint stays whole",
      fields: ["width"],
      needs: ["cells"],
      story: "status-band/default",
    },
    {
      id: "one-line",
      label:
        "Everything on one line: the text cut at the edge by the surface, every button after it",
      fields: ["isOneLine"],
      needs: ["cells:false"],
      story: "status-band/draft",
    },
    {
      id: "actions",
      label: "Further actions after the way in, a quiet Button each, wrapped under the text",
      fields: ["actions"],
      needs: ["cells:false"],
      story: "status-band/success",
    },
    {
      id: "focus",
      label: "The keyboard's focus on the line",
      fields: ["hovered"],
      needs: ["keyFocus:kit|ring"],
      story: "status-band/default",
    },
    {
      id: "words",
      label: "The text in words, with its own meaning icon",
      fields: ["words", "mark"],
      needs: ["cells:false"],
      story: "status-band/question",
    },
  ],
} as const);
