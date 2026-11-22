import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "prose",
  name: "Prose",
  purpose:
    "A text of several blocks set as lines whose rows can be counted, and the window a short room shows of it.",
  impl: { pi: "prose", claude: "prose", gui: "prose" },
  status: { pi: "system", claude: "system", gui: "system" },
  source: "prose/src/terminal.ts",
  features: [
    {
      id: "blocks",
      label: "Paragraphs, lists, ticked items, headings, quotes and rules, with inline Markdown",
      story: "prose/blocks",
      pi: yes(),
      claude: yes(),
      gui: yes("the host's Markdown, as it draws a reply"),
    },
    {
      id: "table",
      label: "A table sized to the room it is given, cells wrapped, the first row bold",
      story: "prose/blocks",
      pi: yes(),
      claude: yes("the engine's Markdown sizes a table to the terminal, not to the pane"),
      gui: yes("the host sizes the table to the pane and wraps its cells"),
    },
    {
      id: "code",
      label: "Fenced code in the code colour, a long line cut instead of wrapped",
      story: "prose/blocks",
      pi: yes("no syntax colours; a `slot` line gives pi's own renderer the block"),
      claude: yes("no syntax colours; a `slot` line gives the engine's renderer the block"),
      gui: yes("the host's code block, in the monospaced face; a long line is not wrapped"),
    },
    {
      id: "window",
      label:
        "A window of the lines (`scrolled` in `lines.ts`, which every window in the kit uses), its first and last row counting what is past them",
      story: "prose/window",
      pi: yes("a marker with a `hit` steps the window; the caller keeps `top`"),
      claude: yes("a marker with a `hit` steps the window; the caller keeps `top`"),
      gui: no("the surface sizes and scrolls the pane itself, so a text is never windowed"),
    },
    {
      id: "excerpt",
      label:
        "A passage that gives way to what follows it: its first line with a More beside it, whole once opened",
      story: "prose/excerpt",
      pi: no("drawn whole: its rows are the pane's, which scrolls"),
      claude: no("drawn whole: its rows are the pane's, which scrolls"),
      gui: yes(
        "the first line dim and cut at the edge with a quiet More; opened, the Markdown whole in a well with Less",
      ),
    },
    {
      id: "quiet",
      label: "Every word quiet",
      story: "prose/quiet",
      pi: yes(),
      claude: yes(),
      gui: yes("`dimColor` on the whole Markdown"),
    },
  ],
});
