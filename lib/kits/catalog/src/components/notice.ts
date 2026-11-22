import { defineComponent, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "notice",
  name: "Notice",
  purpose: "One line telling the person what just happened.",
  impl: { pi: "notice", claude: "notice" },
  features: [
    {
      id: "status-colours",
      label: "Success, warning, error and dim",
      story: "notice/success",
      pi: yes("success, warning and error only for an actual state"),
      claude: yes("Text colour; `$.ui.status` is one plain line per mod, with no colour"),
    },
    {
      id: "one-line",
      label: "Cut to one line",
      story: "notice/long",
      pi: yes(),
      claude: yes("`clamp` with {min: 1, max: 1}"),
    },
  ],
});
