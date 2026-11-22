/** The notice's stories. No host imports. */
import { span } from "@agents/kit-core/lines.ts";
import type { KitStory } from "@agents/kit-core/stories.ts";
import type { NoticeStatus } from "./contract.ts";
import { emptyState, notice } from "./terminal.ts";

const LONG =
  "The sync worker retried 3 times and gave up, so the orders it held are still in the queue for the next run.";
const EMPTY =
  "No doc suggestions yet. They appear here as an agent finds a doc that is out of date.";

/** The props of each story, shared with `stories.gui.tsx`. */
export const noticeProps = {
  success: { text: "Filed LIN-482", status: "success" as NoticeStatus },
  warning: { text: "The draft changed on disk", status: "warning" as NoticeStatus },
  error: { text: "Linear refused the issue: no team", status: "error" as NoticeStatus },
  long: { text: LONG, status: "dim" as NoticeStatus },
  context: {
    // A graphical surface cuts the line itself, so its words carry no `…`.
    gui: [
      span("and check that each one retries after a 429, and that ", { role: "dim" }),
      span("backoff", { role: "error", bold: true }),
      span(" doubles the delay each time and gives up after five tries", { role: "dim" }),
    ],
    spans: [
      span("…and check that each one retries after a 429, and that ", { role: "dim" }),
      span("backoff", { role: "error", bold: true, underline: true }),
      span(" doubles the delay each time and gives up after five tries…", { role: "dim" }),
    ],
  },
  empty: {
    text: EMPTY,
    gui: "Nothing to review. Suggestions appear here as an agent finds a doc that is out of date.",
  },
};

export const noticeLineStories: KitStory[] = (["success", "warning", "error"] as const)
  .map((state): KitStory => ({
    component: "notice-line",
    state,
    about: `A one-line notice, ${state}`,
    settings: `notice(text, width, "${state}")`,
    width: "dialog",
    gui: true,
    lines: (width) => notice(noticeProps[state].text, width, noticeProps[state].status),
  }))
  .concat([
    {
      component: "notice-line",
      state: "long",
      about: "A long notice cut to one line",
      settings: 'notice(text, width, "dim")',
      width: "dialog",
      gui: true,
      lines: (width) => notice(noticeProps.long.text, width, noticeProps.long.status),
    },
    {
      component: "notice-line",
      state: "context",
      about: "A line of spans: a word in its context stands out, the line cut with `…`",
      settings: 'notice(spans, width, "dim")',
      width: "dialog",
      gui: true,
      lines: (width) => notice(noticeProps.context.spans, width, "dim"),
    },
    {
      component: "notice-line",
      state: "empty",
      about: "What a list says when it has no rows: dim and wrapped",
      settings: "emptyState(text, width)",
      width: "dialog",
      gui: true,
      lines: (width) => emptyState(noticeProps.empty.text, width),
    },
  ]);
