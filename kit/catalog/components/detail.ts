import { defineComponent, planned, yes, partial } from "../manifest.ts";

export default defineComponent({
  id: "detail",
  name: "Detail blocks",
  purpose: "What a detail pane or panel body is made of: a section header, prose and notes.",
  impl: { pi: ["section", "prose", "note"], claude: ["section", "note"] },
  features: [
    {
      id: "section-rule",
      label: "Bold header with a dim rule to the edge",
      story: "detail/section",
      pi: yes(),
      claude: yes(
        "there is no divider element; the rule is drawn text sized from the room it is given",
      ),
    },
    {
      id: "prose-measure",
      label: "Prose wrapped at the measure in a wider pane",
      story: "detail/prose-measure",
      pi: yes("80 columns"),
      claude: partial("no prose component: `clamp` at `tokens.prose`, as the story does"),
    },
    {
      id: "note-gutter",
      label: "Note attached to one thing, with a │ / ╰▸ gutter",
      story: "detail/notes",
      pi: yes(),
      claude: yes("a one-liner is `╰▸` alone; the words' colour role and italic are options"),
    },
  ],
});
