import { defineComponent, planned, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "entries",
  name: "Dated entries",
  purpose: "A log, a history or evidence: several entries, each with a date.",
  impl: { pi: "entries", claude: "entries" },
  features: [
    {
      id: "timeline",
      label: "Date column with the text hanging beside it",
      story: "entries/wide",
      pi: yes("from 50 columns; one blank row between entries, no bullets or gutter"),
      claude: yes(
        "the pane's own width decides: a docked pane is about 48 columns, so a date line there; the date column shows inline and wide",
      ),
    },
    {
      id: "narrow",
      label: "Date line above the text below 50 columns",
      story: "entries/narrow",
      pi: yes(),
      claude: yes("the layout in a docked pane"),
    },
    {
      id: "one",
      label: "A single entry",
      story: "entries/one",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "clamp",
      label: "Text bounded through clamp options",
      story: "entries/long-text",
      pi: yes("`lines` is passed to `clamp`"),
      claude: yes(),
    },
    {
      id: "rows",
      label: "Fewer rows than it needs: cut with … or counted as ↓ n more, never a bare ellipsis",
      story: "entries/few-rows",
      pi: yes("`rows` bounds the block"),
      claude: planned("could read the pane's `scroll.bodyRows`; nothing needs a row budget yet"),
    },
    {
      id: "wide-chars",
      label: "Wide characters measured in cells",
      story: "entries/wide-chars",
      pi: yes(),
      claude: yes(),
    },
  ],
});
