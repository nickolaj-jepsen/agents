import { defineComponent, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "prose",
  name: "Prose",
  purpose:
    "A text of several blocks set as lines whose rows can be counted, and the window a short room shows of it.",
  impl: { pi: "prose", claude: "prose" },
  status: { pi: "system", claude: "system", gui: "legacy" },
  source: "prose/src/terminal.ts",
  features: [
    {
      id: "blocks",
      label: "Paragraphs, lists, ticked items, headings, quotes and rules, with inline Markdown",
      story: "prose/blocks",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "table",
      label: "A table sized to the room it is given, cells wrapped, the first row bold",
      story: "prose/blocks",
      pi: yes(),
      claude: yes("the engine's Markdown sizes a table to the terminal, not to the pane"),
    },
    {
      id: "code",
      label: "Fenced code in the code colour, a long line cut instead of wrapped",
      story: "prose/blocks",
      pi: yes("no syntax colours; a `slot` line gives pi's own renderer the block"),
      claude: yes("no syntax colours; a `slot` line gives the engine's renderer the block"),
    },
    {
      id: "window",
      label:
        "A window of the lines (`scrolled` in `lines.ts`, which every window in the kit uses), its first and last row counting what is past them",
      story: "prose/window",
      pi: yes("a marker with a `hit` steps the window; the caller keeps `top`"),
      claude: yes("a marker with a `hit` steps the window; the caller keeps `top`"),
    },
    {
      id: "quiet",
      label: "Every word quiet",
      story: "prose/quiet",
      pi: yes(),
      claude: yes(),
    },
  ],
});
