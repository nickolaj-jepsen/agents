import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

const gone = no("Claude Code draws this with the kit's notice-line now.");

export default defineComponent({
  id: "notice",
  name: "Notice",
  purpose: "One line telling the person what just happened.",
  impl: {
    pi: "notice",
    claude: { none: "Claude Code draws this with the kit's notice-line now." },
  },
  features: [
    {
      id: "status-colours",
      label: "Success, warning, error and dim",
      story: { pi: "notice/success" },
      pi: yes("success, warning and error only for an actual state"),
      claude: gone,
    },
    {
      id: "one-line",
      label: "Cut to one line",
      story: { pi: "notice/long" },
      pi: yes(),
      claude: gone,
    },
  ],
});
