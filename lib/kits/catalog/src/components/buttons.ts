import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

const gone = no("Claude Code draws this with the kit's button-row now.");

export default defineComponent({
  id: "buttons",
  name: "Button row",
  purpose: "Clickable actions and keyboard-only labels, with the suggested action emphasised.",
  impl: {
    pi: "buttonRow",
    claude: { none: "Claude Code draws this with the kit's button-row now." },
  },
  features: [
    {
      id: "row",
      label: "Clickable actions and dim, non-interactive keyboard hints",
      story: { pi: "buttons/row" },
      pi: yes("returns click ranges only for actions"),
      claude: gone,
    },
    {
      id: "wrap",
      label: "A row wider than its room wraps",
      story: { pi: "buttons/wrap" },
      pi: yes("optional; a fixed-height row drops lower-priority entries instead"),
      claude: gone,
    },
  ],
});
