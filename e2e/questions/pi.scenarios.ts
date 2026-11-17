import type { Turn } from "../lib/harness.ts";
import { region } from "../lib/screen.ts";
import { scenarios } from "../lib/scenario.ts";

/** The turn that asks: the model calls the tool, and the dialog takes the screen. */
const turns = (questions: unknown): Turn[] => [
  { toolCall: { name: "ask_user_question", arguments: { questions } } },
];

const ASK = "How should I store the sessions?";
/** Type a prompt, send it, and wait for the dialog's frame. */
const open = (wait: string) => [{ type: ASK }, { press: "Enter" }, { wait, timeout: 20_000 }];

const STORAGE = {
  question: "Where should the session store live?",
  header: "Storage",
  options: [
    {
      label: "SQLite in the checkout",
      description: "One file, no service to run, and it can be deleted with the checkout.",
    },
    {
      label: "Postgres beside the app",
      description: "Shared between machines, and one more service to keep running.",
    },
    { label: "The OS keyring", description: "Nothing to back up, where the host has one." },
  ],
};

const RECORDING = {
  question: "How much of each session should be kept?",
  header: "Retention",
  options: [
    { label: "The whole transcript" },
    { label: "The last turn only" },
    { label: "A summary of each run" },
  ],
};

/** A preview is markdown beside the options, and only on a single-select question. */
const LAYOUT = {
  question: "Which table layout?",
  header: "Layout",
  options: [
    {
      label: "One row per event",
      description: "Append-only, and the history is the table.",
      preview:
        "```sql\ncreate table event (\n  id integer primary key,\n  session text not null,\n  at text not null\n);\n```\n",
    },
    {
      label: "One row per session",
      description: "A document per session, rewritten on every turn.",
      preview:
        "```sql\ncreate table session (\n  id text primary key,\n  body json not null\n);\n```\n",
    },
  ],
};

export default scenarios({
  plugin: "questions",
  harness: "pi",
  region: region.box(/esc cancel|enter yes/),
  scenarios: {
    single: {
      about: "one question with three described options",
      start: { turns: turns([STORAGE]) },
      steps: open("Where should the session store live?"),
    },
    preview: {
      about: "an option's markdown preview beside the options",
      start: { turns: turns([LAYOUT]) },
      steps: open("Which table layout?"),
    },
    multi: {
      about: "a multi-select question with two rows picked and Done offered",
      start: {
        turns: turns([{ ...RECORDING, multiSelect: true }]),
      },
      steps: [
        ...open("How much of each session"),
        { press: "Space" },
        { press: "Down" },
        { press: "Space" },
      ],
    },
    typed: {
      about: "the row for an answer the options do not cover, being typed into",
      region: region.box(/enter save/),
      start: { turns: turns([RECORDING]) },
      steps: [
        ...open("How much of each session"),
        { press: "4" },
        { wait: "enter save" },
        { type: "Until the disk fills" },
      ],
    },
    review: {
      about: "two questions answered, on the review tab",
      start: { turns: turns([STORAGE, RECORDING]) },
      steps: [
        ...open("Where should the session store live?"),
        { press: "Down" },
        { press: "Enter" },
        { wait: "How much of each session" },
        { press: "Down" },
        { press: "Enter" },
        { wait: "enter send" },
      ],
    },
    cancelled: {
      about: "esc asks once before it throws the answers away",
      start: { turns: turns([STORAGE]) },
      steps: [
        ...open("Where should the session store live?"),
        { press: "Escape" },
        { wait: "enter yes" },
      ],
    },
    extreme: {
      about: "the longest headers, labels and descriptions, and a preview, at four sizes",
      start: {
        turns: turns([
          {
            question:
              "Where should a session's full transcript, every tool result and each compaction summary be kept once a run ends?",
            header: "Where stored?",
            options: [
              {
                label: "SQLite in the repository, beside the worktrees",
                description:
                  "One file the checkout can delete, and no service to keep running on any of the machines.",
                preview:
                  "```sql\ncreate table if not exists event (\n  id integer primary key,\n  session text not null,\n  at text not null,\n  body json not null\n) strict;\n```\n\nA row per event, so the history is the table and a reader can replay it.",
              },
              {
                label: "Postgres beside the application, shared by every machine",
                description:
                  "One more service to run, back up and keep reachable from a laptop that is often offline.",
              },
            ],
          },
        ]),
      },
      steps: [
        ...open("Where should a session's full transcript"),
        { press: "Down" },
        { press: "Up" },
      ],
      extreme: true,
    },
  },
});
