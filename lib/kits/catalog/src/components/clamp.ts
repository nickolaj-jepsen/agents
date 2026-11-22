import { defineComponent, planned, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "clamp",
  name: "Clamp",
  purpose:
    "Wraps text to a width in cells and bounds its line count; the text component of the style.",
  impl: { pi: "clamp", claude: ["clamp", "inlineMarkdown"] },
  features: [
    {
      id: "wrap",
      label: "Wrap without limit",
      story: "clamp/unbounded",
      pi: yes(),
      claude: yes("the kit's own wrap, in cells; Text `wrap` still serves a plain paragraph"),
    },
    {
      id: "truncate",
      label: "One-line truncation, last line full before the ellipsis",
      story: "clamp/truncate",
      pi: yes(),
      claude: yes("Text `truncate-end` cuts early; the kit fills the line first"),
    },
    {
      id: "max-lines",
      label: "At most n lines",
      story: "clamp/max-lines",
      pi: yes(),
      claude: yes("Text has no maxLines; the kit cuts the lines itself"),
    },
    {
      id: "min-lines",
      label: "Pad to n lines so rows keep one height",
      story: "clamp/min-lines",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "target",
      label: "Line count from a text length",
      story: "clamp/target",
      pi: yes("a narrow pane gets more lines than a wide list"),
      claude: yes(),
    },
    {
      id: "wide-chars",
      label: "Cells, not characters",
      story: "clamp/wide-chars",
      pi: yes("pi-tui's width functions"),
      claude: yes(
        "`cellWidth` covers East Asian wide characters and emoji; the engine exposes no measure, so the ranges are the kit's own",
      ),
    },
    {
      id: "markdown",
      label: "Inline markdown wrapped as styled runs, for a row pressed whole",
      story: { claude: "clamp/markdown" },
      pi: planned("pi-tui's `Markdown` wraps and styles a paragraph; the pi kit adds nothing yet"),
      claude: yes(
        "`inlineMarkdown`: a Button holds only strings and Text, so the kit sets code, bold, italics and links itself",
      ),
    },
  ],
});
