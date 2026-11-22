import { defineComponent, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "buttons",
  name: "Button row",
  purpose: "Clickable actions and keyboard-only labels, with the suggested action emphasised.",
  impl: { pi: "buttonRow", claude: "buttonRow" },
  features: [
    {
      id: "row",
      label: "Clickable actions and dim, non-interactive keyboard hints",
      story: "buttons/row",
      pi: yes("returns click ranges only for actions"),
      claude: yes("actions use native buttons; keyboard-only hints use plain text"),
    },
    {
      id: "wrap",
      label: "A row wider than its room wraps",
      story: "buttons/wrap",
      pi: yes("optional; a fixed-height row drops lower-priority entries instead"),
      claude: yes("nothing drops, as every key must stay pressable"),
    },
  ],
});
