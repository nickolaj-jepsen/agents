import { defineComponent } from "@agents/kit-core/manifest.ts";
import { fieldsFields, fieldsNeeds } from "./contract.ts";

export default defineComponent({
  schema: 2,
  id: "fields",
  name: "Fields",
  purpose: "What a record holds, one named value each: a row per field, or side by side.",
  contract: { fields: fieldsFields, needs: fieldsNeeds },
  parts: {
    fields: {},
    input: {
      drawings: ["gui"],
      none: { terminal: "the client's own field takes the row: the caller slots it (`slotLine`)" },
    },
  },
  features: [
    {
      id: "grid",
      label:
        "Always a two-column grid: a label column of a fixed width and the value's own cell, read or edited",
      fields: ["fields"],
      story: "fields/editors",
    },
    {
      id: "rows",
      label: "A row per field, the labels in one column; a long value hangs under its start",
      fields: ["width", "valueLines"],
      needs: ["cells"],
      story: "fields/rows",
    },
    {
      id: "keys",
      label: "A key before each field, in the accent where the keyboard is",
      fields: ["active"],
      needs: ["keyFocus:kit|ring"],
      story: "fields/rows",
      limits: {
        "claude-terminal": "the caller binds the letters, on buttons that draw nothing (`ring`)",
      },
    },
    {
      id: "inline",
      label: "Values side by side after their keys, wrapped whole, where rows are short",
      fields: ["inline"],
      needs: ["cells"],
      story: "fields/inline",
    },
    {
      id: "press",
      label: "A field is a control: its row, or its cells when side by side",
      story: "fields/rows",
      limits: {
        vscode: "a value is a quiet Button, or text where it is long",
        desktop: "a value is a quiet Button, or text where it is long",
      },
    },
    {
      id: "one",
      label:
        "A field of one choice: a Select showing the value, after its meaning icon, with no read or edit state",
      needs: ["select"],
      limits: {
        pi: "the choices open in place as lettered rows",
        "claude-terminal": "the choices open in place as lettered rows",
      },
      story: "fields/editors",
    },
    {
      id: "many",
      label: "A field of several: toggle chips, and a search that offers matches as more chips",
      needs: ["input", "select"],
      limits: {
        pi: "the choices open in place as lettered, tickable rows",
        "claude-terminal": "the choices open in place as lettered, tickable rows",
      },
      story: "fields/labels-search",
    },
    {
      id: "text",
      label: "A field of text: an Input at the value's width",
      needs: ["input"],
      limits: {
        pi: "the caller opens the client's own field",
        "claude-terminal": "the caller opens the client's own field",
      },
      story: "fields/editors",
    },
    {
      id: "read",
      label: "Read only: no keys and nothing to press",
      story: "fields/read",
    },
  ],
} as const);
