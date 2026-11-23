import { defineComponent } from "@agents/kit-core/manifest.ts";
import { sheetFields, sheetNeeds } from "./contract.ts";

export default defineComponent({
  schema: 2,
  id: "sheet",
  name: "Sheet",
  purpose:
    "A panel laid over the screen, closed on every side: the title and Close in its top edge, buttons at its foot.",
  contract: { fields: sheetFields, needs: sheetNeeds },
  parts: { sheet: {}, sheetHead: {} },
  features: [
    {
      id: "title",
      label: "A title, the body, and the buttons at its foot, several rows of them",
      fields: ["title", "caption", "body", "footer"],
      story: "sheet/title",
    },
    {
      id: "edges",
      label: "Closed on every side, the title and Close in the top edge",
      fields: ["width"],
      needs: ["cells", "framesPane:false"],
      story: "sheet/title",
    },
    {
      id: "confirm",
      label: "Close asks before it throws the work away, in the place it stood",
      fields: ["close"],
      story: "sheet/confirm",
      limits: {
        "claude-terminal": "in `sheetHead`: the question stands at the right of the title",
      },
    },
    {
      id: "notice",
      label: "A notice in a row of its own above the buttons",
      fields: ["notice"],
      story: "sheet/confirm",
      limits: {
        "claude-terminal": "without the edges a mod sets the row itself, above its button row",
      },
    },
    {
      id: "standing",
      label: "No bottom edge, where it stands on a rule the host draws",
      fields: ["foot"],
      needs: ["cells", "framesPane:false"],
      story: "sheet/standing",
    },
    {
      id: "head",
      label: "The top edge alone: the title, and the question Close asks",
      story: "sheet/head",
    },
    {
      id: "host",
      label: "The pane's own title, and its own actions, where the host frames the pane",
      fields: ["hostTitle", "head", "actions"],
      needs: ["cells:false"],
      story: "sheet/title",
    },
  ],
} as const);
