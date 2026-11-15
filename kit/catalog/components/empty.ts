import { defineComponent, yes } from "../manifest.ts";

export default defineComponent({
  id: "empty",
  name: "Empty state",
  purpose: "What a list says when there is nothing in it.",
  impl: { pi: "emptyState", claude: "emptyState" },
  features: [
    {
      id: "default",
      label: "Dim text standing in for the rows",
      story: "empty/default",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "wrap",
      label: "Wraps in a narrow pane",
      story: "empty/long",
      pi: yes(),
      claude: yes("`clamp` joined with newlines, not Text `wrap`"),
    },
  ],
});
