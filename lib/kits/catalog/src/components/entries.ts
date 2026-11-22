import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

const gone = no("Claude Code draws this with the kit's item-detail now.");

export default defineComponent({
  id: "entries",
  name: "Dated entries",
  purpose: "A log, a history or evidence: several entries, each with a date.",
  impl: {
    pi: "entries",
    claude: { none: "Claude Code draws this with the kit's item-detail now." },
  },
  features: [
    {
      id: "timeline",
      label: "Date column with the text hanging beside it",
      story: { pi: "entries/wide" },
      pi: yes("from 50 columns; one blank row between entries, no bullets or gutter"),
      claude: gone,
    },
    {
      id: "narrow",
      label: "Date line above the text below 50 columns",
      story: { pi: "entries/narrow" },
      pi: yes(),
      claude: gone,
    },
    {
      id: "one",
      label: "A single entry",
      story: { pi: "entries/one" },
      pi: yes(),
      claude: gone,
    },
    {
      id: "clamp",
      label: "Text bounded through clamp options",
      story: { pi: "entries/long-text" },
      pi: yes("`lines` is passed to `clamp`"),
      claude: gone,
    },
    {
      id: "rows",
      label: "Fewer rows than it needs: cut with … or counted as ↓ n more, never a bare ellipsis",
      story: { pi: "entries/few-rows" },
      pi: yes("`rows` bounds the block"),
      claude: gone,
    },
    {
      id: "wide-chars",
      label: "Wide characters measured in cells",
      story: { pi: "entries/wide-chars" },
      pi: yes(),
      claude: gone,
    },
  ],
});
