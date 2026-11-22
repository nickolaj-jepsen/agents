import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

const gone = no("Claude Code draws this with the kit's grouped-list now.");

export default defineComponent({
  id: "empty",
  name: "Empty state",
  purpose: "What a list says when there is nothing in it.",
  impl: {
    pi: "emptyState",
    claude: { none: "Claude Code draws this with the kit's grouped-list now." },
  },
  features: [
    {
      id: "default",
      label: "Dim text standing in for the rows",
      story: { pi: "empty/default" },
      pi: yes(),
      claude: gone,
    },
    {
      id: "wrap",
      label: "Wraps in a narrow pane",
      story: { pi: "empty/long" },
      pi: yes(),
      claude: gone,
    },
  ],
});
