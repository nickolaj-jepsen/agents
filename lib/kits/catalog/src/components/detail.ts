import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

const gone = no("Claude Code draws this with the kit's item-detail now.");

export default defineComponent({
  id: "detail",
  name: "Detail blocks",
  purpose: "What a detail pane or panel body is made of: a section header, prose and notes.",
  impl: {
    pi: ["section", "prose", "note"],
    claude: { none: "Claude Code draws this with the kit's item-detail now." },
  },
  features: [
    {
      id: "section-rule",
      label: "Bold header with a dim rule to the edge",
      story: { pi: "detail/section" },
      pi: yes(),
      claude: gone,
    },
    {
      id: "prose-measure",
      label: "Prose wrapped at the measure in a wider pane",
      story: { pi: "detail/prose-measure" },
      pi: yes("80 columns"),
      claude: gone,
    },
    {
      id: "note-gutter",
      label: "Note attached to one thing, with a │ / ╰▸ gutter",
      story: { pi: "detail/notes" },
      pi: yes(),
      claude: gone,
    },
  ],
});
