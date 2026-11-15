import { defineComponent, no, yes } from "../manifest.ts";

export default defineComponent({
  id: "buttons",
  name: "Button row",
  purpose: "The keys of a screen in one row, each showing its key, the one worth pressing lit.",
  impl: {
    pi: { none: "pi sets the keys into the frame's bottom border as hints (see frame)" },
    claude: "buttonRow",
  },
  features: [
    {
      id: "row",
      label: "Key chips in one row, dim but for the lit one",
      story: "buttons/row",
      pi: no("hints in the border instead"),
      claude: yes("plain Buttons: the engine draws the key and the click and hotkey come free"),
    },
    {
      id: "wrap",
      label: "A row wider than its room wraps",
      story: "buttons/wrap",
      pi: no("pi drops the lowest priority hint instead"),
      claude: yes("nothing drops, as every key must stay pressable"),
    },
  ],
});
