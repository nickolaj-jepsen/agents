import { fileURLToPath } from "node:url";
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

// The open frame has no corners; both rules span the composer.
const frameRegion = region.rows(/^─ .+ ─{2,}$/, /^─{10,}$/);

export default scenarios({
  plugin: "questions",
  harness: "pi",
  // Hermetic: its own config with this plugin alone, so nothing of the person's setup shows.
  start: { hermetic: true, plugins: ["questions"], turns: [] },
  region: frameRegion,
  scenarios: {
    single: {
      about: "one question with three described options",
      start: { turns: turns([STORAGE]) },
      steps: open("Where should the session store live?"),
    },
    "hover-note": {
      from: "single",
      about: "hover highlights a choice and then the separated Note row",
      steps: [{ hover: "Postgres beside the app" }, { hover: "Add a note" }],
    },
    "footer-buttons": {
      from: "single",
      about: "keyboard-only labels do nothing on click, while footer buttons edit and cancel",
      region: region.rows(/The user cancelled/, /cancelled the questions/),
      steps: [
        { click: "↑↓ move" },
        { wait: "Where should the session store live?" },
        { click: "n note" },
        { wait: "enter save" },
        { type: "A clicked note" },
        { click: "enter save" },
        { wait: "Note: A clicked note" },
        { click: "esc cancel" },
        { wait: "enter yes" },
        { click: "esc no" },
        { wait: "enter yes", gone: true },
        { click: "esc cancel" },
        { click: "enter yes" },
        { wait: "The user cancelled" },
      ],
    },
    preview: {
      about: "an option's markdown preview beside the options or stacked at 70 columns",
      start: { turns: turns([LAYOUT]) },
      steps: open("Which table layout?"),
    },
    "preview-scroll": {
      from: "preview",
      about: "the stacked preview remains readable and scrollable",
      steps: [
        { resize: [70, 24] },
        { wait: /Preview  1–/ },
        { press: "Shift+Down" },
        { wait: /Preview  [2-9]–/ },
        { press: "Shift+Up" },
        { wait: /Preview  1–/ },
        { press: "Down" },
        { wait: "create table session" },
      ],
      sizes: [[70, 24]],
    },
    "draft-submit": {
      about: "the form replaces the composer and restores its draft after submit",
      start: {
        args: ["-e", fileURLToPath(new URL("./draft.ts", import.meta.url))],
        turns: turns([STORAGE, RECORDING]),
      },
      region: region.rows(/The user answered:/, /Composer draft!/),
      steps: [
        ...open("Where should the session store live?"),
        { wait: "Composer draft", gone: true },
        { press: "b" },
        { wait: "How much of each session" },
        { click: "Add a note" },
        { type: "Keep the defaults" },
        { press: "Enter" },
        { click: "The whole transcript" },
        { wait: "Review your answers" },
        { press: "Enter" },
        { wait: "The user answered:" },
        { press: "End" },
        { type: "!" },
        { wait: "Composer draft!" },
      ],
    },
    "write-in-only": {
      about: "a multi-select accepts a write-in without any checked options",
      start: { turns: turns([{ ...RECORDING, multiSelect: true }]) },
      region: region.rows(/The user answered:/, /Until the disk fills/),
      steps: [
        ...open("How much of each session"),
        { press: "4" },
        { type: "Until the disk fills" },
        { press: "Enter" },
        { click: "Done" },
        { wait: "The user answered:" },
        { wait: "Until the disk fills" },
      ],
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
              "Where should a session's **full transcript**, every tool result and each compaction summary be kept once a run ends? Include the archived sessions, the `tool_result` records and the full 日本語 transcript, not just the latest entry. Assume the developer will often be offline and needs to carry this between machines without losing any run history.",
            header: "Where stored?",
            options: [
              {
                label: "SQLite in the repository, beside the worktrees",
                description:
                  "**One file** the checkout can delete, and no service to keep running on any of the machines. Copy it together with the 日本語 fixtures, then open it with `sqlite3` to replay the results in order. Test the backup and document what to do if either machine is offline.",
                preview:
                  "```sql\ncreate table if not exists event (\n  id integer primary key,\n  session text not null,\n  at text not null,\n  body json not null\n) strict;\n```\n\nA row per event, so the history is the table and a reader can replay it.",
              },
              {
                label: "Postgres beside the application, shared by every machine",
                description:
                  "One more service to run, back up and keep reachable from a laptop that is often offline.",
              },
              {
                label: "Keep a **local log** beside each checkout and merge later",
                description:
                  "Works offline without setting up a server, but syncing a single run can produce duplicate records.",
              },
              {
                label: "Mirror sessions to an **append-only** archive as they finish",
                description:
                  "The archive stores every event and preserves links to the original run.",
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
