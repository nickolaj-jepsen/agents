import { defineComponent } from "@agents/kit-core/manifest.ts";
import { noticeFields, noticeNeeds } from "./contract.ts";

export default defineComponent({
  schema: 2,
  id: "notice-line",
  name: "Notice and empty state",
  purpose:
    "One line telling the person what happened, in a role, and the dim words that stand in for a list's rows.",
  contract: { fields: noticeFields, needs: noticeNeeds },
  parts: { notice: {}, emptyState: {} },
  features: [
    {
      id: "status",
      label:
        "A state (success, warning, error, pending) in its colour; only an actual state takes one",
      fields: ["text", "status"],
      story: "notice-line/success",
      limits: {
        pi: "the words take the state's colour; the icon is a graphical surface's",
        "claude-terminal": "the words take the state's colour; the icon is a graphical surface's",
      },
    },
    {
      id: "warning",
      label: "A warning: something needs a look",
      story: "notice-line/warning",
    },
    {
      id: "error",
      label: "An error: something failed",
      story: "notice-line/error",
    },
    {
      id: "pending",
      label: "A state that is not over: an icon, its words quiet",
      story: "notice-line/pending",
      limits: {
        pi: "quiet words, with no icon",
        "claude-terminal": "quiet words, with no icon",
      },
    },
    {
      id: "one-line",
      label: "Cut to one line with `…`, to the room it is given",
      fields: ["width"],
      needs: ["cells"],
      story: "notice-line/long",
    },
    {
      id: "wrapped",
      label: "Wrapped whole instead of cut",
      fields: ["isWrapped"],
      needs: ["cells"],
      story: "notice-line/wrapped",
    },
    {
      id: "cut",
      label: "Cut at the edge by the surface, which lays the line out itself",
      fields: ["isCut"],
      needs: ["cells:false"],
      story: "notice-line/long",
    },
    {
      id: "spans",
      label: "Spans in place of words: a word in its context stands out",
      story: "notice-line/context",
    },
    {
      id: "empty",
      label: "An empty state: caption words standing in for a list's rows, wrapping",
      fields: ["isEmpty"],
      story: "notice-line/empty",
    },
    {
      id: "words",
      label: "A fuller sentence in place of the terminal's shorthand",
      fields: ["words"],
      needs: ["cells:false"],
      story: "notice-line/empty",
    },
  ],
} as const);
