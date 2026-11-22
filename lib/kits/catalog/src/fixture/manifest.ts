import { defineComponent } from "@agents/kit-core/manifest.ts";
import { rowFields, rowNeeds } from "./contract.ts";

export default defineComponent({
  schema: 2,
  id: "fixture",
  name: "Fixture",
  purpose: "A throwaway component the schema's checks are proved on.",
  contract: { fields: rowFields, needs: rowNeeds },
  parts: {
    rows: {},
    rowsFollow: { drawings: ["terminal"], none: { gui: "the host scrolls" } },
  },
  features: [
    { id: "text", label: "A row of text", fields: ["key", "text", "aside"], story: "fixture/rows" },
    {
      id: "focus",
      label: "The keyboard's row has the pointer",
      fields: ["focused"],
      needs: ["keyFocus:kit|ring"],
      story: "fixture/rows",
    },
    {
      id: "hover",
      label: "The pointer's row is shown",
      fields: ["hovered"],
      needs: ["hover:kit|painter"],
      story: "fixture/rows",
      limits: { pi: "the label is bold, with no fill" },
    },
    {
      id: "window",
      label: "A window of the lines",
      fields: ["detailLines"],
      needs: ["window"],
      story: "fixture/window",
    },
  ],
} as const);
