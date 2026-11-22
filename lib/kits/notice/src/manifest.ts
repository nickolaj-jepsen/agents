import { defineComponent, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "notice-line",
  name: "Notice and empty state",
  purpose:
    "One line telling the person what happened, in a role, and the dim words that stand in for a list's rows.",
  impl: {
    pi: ["notice", "emptyState"],
    claude: ["notice", "emptyState"],
    gui: ["notice", "emptyState"],
  },
  status: { pi: "system", claude: "system", gui: "system" },
  source: "notice/src/terminal.ts",
  features: [
    {
      id: "status-colours",
      label: "Success, warning, error and dim",
      story: "notice-line/success",
      pi: yes("success, warning and error only for an actual state"),
      claude: yes("Text colour; `$.ui.status` is one plain line per mod, with no colour"),
      gui: yes("the text in the role, with an icon for success, warning and error"),
    },
    {
      id: "one-line",
      label: "Cut to one line",
      story: "notice-line/long",
      pi: yes("cut with `…`; `isWrapped` wraps the whole text"),
      claude: yes("cut with `…`; `isWrapped` wraps the whole text"),
      gui: yes("`isCut` has the surface cut it at the edge; otherwise the surface wraps it"),
    },
    {
      id: "spans",
      label: "Spans in place of words: a word in its context stands out",
      story: "notice-line/context",
      pi: yes("cut with `…`; `isWrapped` wraps them; a span with no role takes the status's"),
      claude: yes("cut with `…`; `isWrapped` wraps them; a span with no role takes the status's"),
      gui: yes("nested runs in one Text, which the surface wraps or, with `isCut`, cuts"),
    },
    {
      id: "empty",
      label: "An empty state: dim words standing in for a list's rows, wrapping",
      story: "notice-line/empty",
      pi: yes(),
      claude: yes(),
      gui: yes("a fuller sentence can be passed as the graphical option `text`"),
    },
  ],
});
