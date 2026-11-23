import { defineLegacyComponent, no, planned, yes } from "@agents/kit-core/manifest.ts";

const gone = no(
  "Claude Code wraps and clamps with the kit's `clamp` in kit/lines.ts, which every kit component uses.",
);

export default defineLegacyComponent({
  id: "clamp",
  name: "Clamp",
  purpose:
    "Wraps text to a width in cells and bounds its line count; the text component of the style.",
  impl: {
    pi: "clamp",
    claude: {
      none: "Claude Code wraps and clamps with the kit's `clamp` in kit/lines.ts, which every kit component uses.",
    },
  },
  features: [
    {
      id: "wrap",
      label: "Wrap without limit",
      story: { pi: "clamp/unbounded" },
      pi: yes(),
      claude: gone,
    },
    {
      id: "truncate",
      label: "One-line truncation, last line full before the ellipsis",
      story: { pi: "clamp/truncate" },
      pi: yes(),
      claude: gone,
    },
    {
      id: "max-lines",
      label: "At most n lines",
      story: { pi: "clamp/max-lines" },
      pi: yes(),
      claude: gone,
    },
    {
      id: "min-lines",
      label: "Pad to n lines so rows keep one height",
      story: { pi: "clamp/min-lines" },
      pi: yes(),
      claude: gone,
    },
    {
      id: "target",
      label: "Line count from a text length",
      story: { pi: "clamp/target" },
      pi: yes("a narrow pane gets more lines than a wide list"),
      claude: gone,
    },
    {
      id: "wide-chars",
      label: "Cells, not characters",
      story: { pi: "clamp/wide-chars" },
      pi: yes("pi-tui's width functions"),
      claude: gone,
    },
    {
      id: "markdown",
      label: "Inline markdown wrapped as styled runs, for a row pressed whole",
      pi: planned("pi-tui's `Markdown` wraps and styles a paragraph; the pi kit adds nothing yet"),
      claude: gone,
    },
  ],
});
