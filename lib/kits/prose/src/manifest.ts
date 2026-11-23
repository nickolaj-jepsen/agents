import { defineComponent } from "@agents/kit-core/manifest.ts";
import { proseFields, proseNeeds } from "./contract.ts";

export default defineComponent({
  schema: 2,
  id: "prose",
  name: "Prose",
  purpose:
    "A text of several blocks set as lines whose rows can be counted, and the window a short room shows of it.",
  contract: { fields: proseFields, needs: proseNeeds },
  parts: { prose: {} },
  features: [
    {
      id: "blocks",
      label: "Paragraphs, lists, ticked items, headings, quotes and rules, with inline Markdown",
      fields: ["text"],
      story: "prose/blocks",
    },
    {
      id: "measure",
      label: "Set to the room it is given in cells, wherever the surface does not wrap it itself",
      fields: ["width"],
      needs: ["cells"],
      story: "prose/blocks",
    },
    {
      id: "table",
      label: "A table sized to the room it is given, cells wrapped, the first row bold",
      story: "prose/blocks",
      limits: {
        "claude-terminal": "the engine's Markdown sizes a table to the terminal, not to the pane",
      },
    },
    {
      id: "code",
      label: "Fenced code in the code colour, a long line cut instead of wrapped",
      story: "prose/blocks",
    },
    {
      id: "window",
      label:
        "A window of the lines (`scrolled` in `lines.ts`, which every window in the kit uses), its first and last row counting what is past them",
      needs: ["window"],
      story: "prose/window",
    },
    {
      id: "excerpt",
      label:
        "A passage that gives way to what follows it: its first line with a More beside it, whole once opened",
      fields: ["excerpt"],
      needs: ["cells:false"],
      story: "prose/excerpt",
    },
    {
      id: "opened",
      label: "An opened passage: the Markdown whole in a panel, with Less",
      needs: ["cells:false"],
      story: "prose/opened",
    },
    {
      id: "quiet",
      label: "Every word quiet",
      fields: ["isDim"],
      story: "prose/quiet",
    },
  ],
} as const);
