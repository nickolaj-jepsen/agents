import type { Turn } from "@agents/drive/lib/harness.ts";
import type { Step } from "@agents/drive/lib/scenario.ts";
import { poster, site, slow } from "@agents/drive/lib/site.ts";

const QUESTIONS = [
  {
    question: "Where should the session store live?",
    header: "Storage",
    options: [
      {
        label: "SQLite in the checkout (Recommended)",
        description: "One file, no service to run, and it goes with the checkout.",
      },
      {
        label: "Postgres beside the app",
        description: "Shared between machines, and one more service to keep running.",
      },
      { label: "The OS keyring", description: "Nothing to back up, where the host has one." },
    ],
  },
  {
    question: "How much of each session should be kept?",
    header: "Retention",
    options: [
      { label: "The whole transcript" },
      { label: "The last turn only" },
      { label: "A summary of each run" },
    ],
    multiSelect: true,
  },
];

const turns: Turn[] = [
  { toolCall: { name: "ask_user_question", arguments: { questions: QUESTIONS } } },
];
const ask = "How should I store the sessions?";
/** One step per key: a key sent before the last one settled can be lost. */
const keys = (...names: string[]): Step[] => names.map((press) => ({ press }));

export default site({
  plugin: "questions",
  demo: {
    caption:
      "A turn needs a decision it can't make alone: one to four questions in a dialog, answered with a key or a click, and the answers come back to it as data.",
    project: "orders-api",
    harness: "pi",
    start: { hermetic: true, plugins: ["questions"], turns },
    steps: [
      { sleep: 400 },
      slow(ask),
      { press: "Enter" },
      { wait: /Where should the session store live\?/, timeout: 20_000 },
      { sleep: 2200 },
      { press: "Enter" },
      { wait: /How much of each session/, timeout: 10_000 },
      { sleep: 1800 },
      ...keys("Space", "Down", "Space"),
      { sleep: 1800 },
      { press: "s" },
      { wait: "Send ↵", timeout: 10_000 },
      { sleep: 2400 },
      poster,
      { press: "Enter" },
      { wait: /answered/, timeout: 10_000 },
      { sleep: 2600 },
    ],
  },
  stills: {
    review: {
      caption:
        "Every question answered, the review tab lists them with the reply, and enter sends it.",
      project: "orders-api",
      harness: "pi",
      start: { hermetic: true, plugins: ["questions"], turns },
      steps: [
        { type: ask },
        { press: "Enter" },
        { wait: /Where should the session store live\?/ },
        { press: "Enter" },
        { wait: /How much of each session/ },
        ...keys("Space", "Down", "Space", "s"),
        { wait: "Send ↵" },
      ],
    },
  },
});
