/** The notice's stories: the model as data, and what each drawing adds. No host imports. */
import { span } from "@agents/kit-core/lines.ts";
import type { GuiExt, StageExt, Story } from "@agents/kit-core/stories.ts";
import type { NoticeModel } from "./model.ts";

const LONG =
  "The sync worker retried 3 times and gave up, so the orders it held are still in the queue for the next run.";
const EMPTY =
  "No doc suggestions yet. They appear here as an agent finds a doc that is out of date.";

const DIALOG: { terminal: StageExt } = { terminal: { stage: "dialog" } };

const state = (
  state: "success" | "warning" | "error" | "pending",
  text: string,
  about: string,
): Story<NoticeModel, StageExt, GuiExt> => ({
  component: "notice-line",
  state,
  about,
  settings: `notice({text, status: "${state}"})`,
  model: { text, status: state },
  ext: DIALOG,
});

export const noticeLineStories: Story<NoticeModel, StageExt, GuiExt>[] = [
  state("success", "Filed LIN-482", "A one-line notice for something that is done"),
  state(
    "warning",
    "The draft changed on disk",
    "A one-line notice for something that needs a look",
  ),
  state(
    "error",
    "Linear refused the issue: no team",
    "A one-line notice for something that failed",
  ),
  state(
    "pending",
    "Drafting the issue",
    "A state that is not over: an icon on a graphical surface, quiet words in a terminal",
  ),
  {
    component: "notice-line",
    state: "long",
    about: "A long notice cut to one line",
    settings: 'notice({text, status: "dim", isCut: true})',
    // A graphical surface cuts the line itself, at its edge.
    model: { text: LONG, status: "dim", isCut: true },
    ext: DIALOG,
  },
  {
    component: "notice-line",
    state: "wrapped",
    about: "A long notice wrapped whole instead of cut",
    settings: 'notice({text, status: "dim", isWrapped: true})',
    model: { text: LONG, status: "dim", isWrapped: true },
    ext: DIALOG,
  },
  {
    component: "notice-line",
    state: "context",
    about: "A line of spans: a word in its context stands out, the line cut",
    settings: 'notice({text: spans, status: "dim"})',
    model: {
      text: [
        span("…and check that each one retries after a 429, and that ", { role: "dim" }),
        span("backoff", { role: "error", bold: true, underline: true }),
        span(" doubles the delay each time and gives up after five tries…", { role: "dim" }),
      ],
      status: "dim",
      // A graphical surface cuts the line itself, so its words carry no `…`.
      words: [
        span("and check that each one retries after a 429, and that ", { role: "dim" }),
        span("backoff", { role: "error", bold: true }),
        span(" doubles the delay each time and gives up after five tries", { role: "dim" }),
      ],
      isCut: true,
    },
    ext: DIALOG,
  },
  {
    component: "notice-line",
    state: "empty",
    about: "What a list says when it has no rows: caption words, wrapped",
    settings: "emptyState({text})",
    model: {
      text: EMPTY,
      isEmpty: true,
      // A graphical surface has room for the fuller sentence.
      words:
        "Nothing to review. Suggestions appear here as an agent finds a doc that is out of date.",
    },
    ext: DIALOG,
  },
];
