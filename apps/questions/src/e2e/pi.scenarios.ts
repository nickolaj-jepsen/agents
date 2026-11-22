import { fileURLToPath } from "node:url";
import type { Turn } from "@agents/drive/lib/harness.ts";
import { region } from "@agents/drive/lib/screen.ts";
import { scenarios } from "@agents/drive/lib/scenario.ts";

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
const frameRegion = region.rows(/^─ .+ ─+$/, /^─{10,}$/);

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
    "radio-hover": {
      about: "a hovered radio does not take the accent away from an already selected radio",
      start: { turns: turns([RECORDING, STORAGE]) },
      steps: [
        ...open("How much of each session"),
        { click: "The whole transcript" },
        { wait: "Where should the session store live?" },
        { press: "Shift+Tab" },
        { wait: "How much of each session" },
        { hover: "A summary of each run" },
      ],
    },
    "hover-note": {
      from: "single",
      about: "hover highlights a choice and then the separated Note row",
      steps: [{ hover: "Postgres beside the app" }, { hover: "Add a note" }],
    },
    "footer-buttons": {
      from: "single",
      about: "Close asks before discarding, even while editing a note",
      region: region.rows(/The user cancelled/, /cancelled the questions/),
      steps: [
        { click: "Note [n]" },
        { wait: "Save ↵" },
        { type: "A clicked note" },
        { click: "Close ×" },
        { wait: "Discard answers?" },
        { click: "Keep [esc]" },
        { wait: "Note: A clicked note" },
        { click: "Note [n]" },
        { click: "Save ↵" },
        { wait: "Note: A clicked note" },
        { click: "Close ×" },
        { click: "Discard ↵" },
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
        turns: [...turns([STORAGE, RECORDING]), { text: "Got it." }],
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
        { wait: "Send ↵" },
        { press: "Enter" },
        { wait: "Got it." },
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
        { wait: "D ■ Until the disk fills" },
        { click: "Send [s]" },
        { wait: "The user answered:" },
        { wait: "Until the disk fills" },
      ],
    },
    multi: {
      about: "a multi-select with two picks, a note, and submit separate from the choices",
      start: {
        turns: turns([{ ...RECORDING, multiSelect: true }]),
      },
      steps: [
        ...open("How much of each session"),
        { press: "s" },
        { wait: "Pick an option or write an answer first" },
        { click: "space toggle" },
        { wait: "A □ The whole transcript" },
        { press: "Space" },
        { wait: "A ■ The whole transcript" },
        { press: "Down" },
        { press: "Enter" },
        { wait: "B ■ The last turn only" },
        { click: "The last turn only" },
        { wait: "B □ The last turn only" },
        { press: "2" },
        { wait: "B ■ The last turn only" },
        { click: "Note [n]" },
        { type: "Keep local copies" },
        { click: "Save ↵" },
        { wait: "Note: Keep local copies" },
        { hover: "A summary of each run" },
      ],
    },
    "multi-continue": {
      about: "continue from a multi-select with a write-in and restore the composer draft on send",
      start: {
        args: ["-e", fileURLToPath(new URL("./draft.ts", import.meta.url))],
        turns: [...turns([{ ...RECORDING, multiSelect: true }, STORAGE]), { text: "Got it." }],
      },
      region: region.rows(/The user answered:/, /Composer draft!/),
      steps: [
        ...open("How much of each session"),
        { wait: "Composer draft", gone: true },
        { press: "a" },
        { click: "Write your own answer" },
        { type: "Keep metadata too" },
        { press: "Enter" },
        { wait: "D ■ Keep metadata too" },
        { press: "n" },
        { type: "Check disk usage" },
        { press: "Escape" },
        { wait: "Note: Check disk usage" },
        { press: "Tab" },
        { wait: "Where should the session store live?" },
        { press: "Shift+Tab" },
        { wait: "D ■ Keep metadata too" },
        { click: "Continue [s]" },
        { wait: "Where should the session store live?" },
        { press: "b" },
        { wait: "Send ↵" },
        { click: "Send ↵" },
        { wait: "The whole transcript, Keep metadata too" },
        { wait: "note: Check disk usage" },
        { wait: "Got it." },
        { press: "End" },
        { type: "!" },
        { wait: "Composer draft!" },
      ],
    },
    "multi-extreme": {
      about: "long descriptions and wide characters in a scrollable checkbox list",
      start: {
        turns: turns([
          {
            header: "保存とアーカイブ",
            question:
              "Which parts of the **complete session history** should stay available across machines? Include the archived sessions, the `tool_result` records, and the full 日本語 transcript when deciding what needs to be kept. Assume one machine will often be offline.",
            multiSelect: true,
            options: [
              {
                label: "The complete transcript including all 日本語 tool records",
                description:
                  "An offline copy keeps the full sequence of user and assistant messages, tool calls and their results. Copy it with the archive index, check that the most recent run shows up, and keep enough space for a second copy.",
              },
              {
                label: "Every exported summary and its original session index",
                description:
                  "Read the **session index** first to find the full run. Retain the original summary with the exported version so edits can be compared offline.",
              },
              {
                label: "個別のツール結果と transcripts before each compaction",
                description:
                  "Keep the `tool_result` records and intermediate summaries as they were written, including all of the Japanese test fixtures.",
              },
              {
                label: "A backup manifest that names deleted or missing sessions",
                description:
                  "Record which sessions were deliberately deleted, which moves are still pending, and whether the backup was verified on both machines.",
              },
            ],
          },
        ]),
      },
      steps: [
        ...open("space toggle"),
        { press: "b" },
        { press: "e" },
        { type: "保管する項目 and the archive index from the last complete export" },
        { press: "Enter" },
        { press: "n" },
        {
          type: "二台の端末で確認 Check both machines before deleting any archived session or exported summary",
        },
        { press: "Enter" },
        { press: "a" },
        { wait: /A ■/ },
      ],
      extreme: true,
    },
    typed: {
      about: "the row for an answer the options do not cover, being typed into",
      start: { turns: turns([RECORDING]) },
      steps: [
        ...open("How much of each session"),
        { press: "4" },
        { wait: "Save ↵" },
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
        { wait: "Send ↵" },
      ],
    },
    "review-hover": {
      from: "review",
      about: "hover the header and footer without changing steps",
      steps: [{ hover: "Close ×" }, { hover: "2 Retention" }, { wait: "Send ↵" }],
    },
    "review-footer-hover": {
      from: "review",
      about: "bold only the footer action under the pointer",
      steps: [{ hover: "Send ↵" }],
    },
    "review-answer-hover": {
      from: "review",
      about: "hover an answer without opening its step",
      steps: [{ hover: "Postgres beside the app" }],
    },
    "review-edit": {
      from: "review",
      about: "reopen by number or by clicking an answer, then use the named step strip",
      steps: [
        { press: "2" },
        { wait: "How much of each session" },
        { press: "c" },
        { wait: "Send ↵" },
        { click: "Postgres beside the app" },
        { wait: "Where should the session store live?" },
        { click: "2 Retention" },
        { wait: "How much of each session" },
        { click: "Review" },
        { wait: "Send ↵" },
        { press: "Escape" },
        { wait: "Discard ↵" },
        { click: "Keep [esc]" },
        { wait: "Send ↵" },
      ],
    },
    "review-incomplete": {
      about: "review names unanswered steps and Enter returns to the first one",
      start: { turns: turns([STORAGE, RECORDING]) },
      steps: [
        ...open("Where should the session store live?"),
        { click: "Review" },
        { wait: "Not answered" },
        { wait: "Answer first ↵" },
        { click: "Answer first ↵" },
        { wait: "Answer question 1 first" },
      ],
    },
    "review-extreme": {
      about: "four named steps with multiple picks, a write-in and a wrapping note",
      start: {
        turns: turns([
          {
            ...RECORDING,
            header: "保存とアーカイブの設定",
            multiSelect: true,
            options: [
              { label: "Complete 日本語 transcript and the uncompressed tool log" },
              { label: "Every exported summary with the original session index" },
              { label: "All **intermediate** versions before each compaction" },
              { label: "A manifest of deleted and missing archived sessions" },
            ],
          },
          { ...STORAGE, header: "Local storage" },
          { ...RECORDING, header: "履歴バックアップ", question: "What belongs in each backup?" },
          { ...STORAGE, header: "Remote storage", question: "Where should the remote copy live?" },
        ]),
      },
      steps: [
        ...open("space toggle"),
        { press: "a" },
        { press: "b" },
        { press: "c" },
        { press: "d" },
        { press: "e" },
        {
          type: "保管する項目 and the archive index from the last complete export with both timestamps and a reference to the original repository",
        },
        { press: "Enter" },
        { press: "n" },
        {
          type: "二台の端末で確認 Check both machines before deleting any archived session or exported summary. Check the last successful copy in the log and make sure the local index has the same entry.",
        },
        { press: "Enter" },
        { press: "s" },
        { wait: "Where should the session store live?" },
        { press: "a" },
        { wait: "What belongs in each backup?" },
        { press: "b" },
        { wait: "Where should the remote copy live?" },
        { press: "b" },
        { wait: "Send ↵" },
        { resize: [70, 24] },
        { wait: "Lines 1–" },
        { press: "Shift+Down" },
        { wait: "Lines 4–" },
        { press: "Shift+Up" },
        { wait: "Lines 1–" },
      ],
      extreme: true,
    },
    cancelled: {
      about: "Escape opens the frame confirmation; Escape keeps the draft",
      start: { turns: turns([STORAGE]) },
      steps: [
        ...open("Where should the session store live?"),
        { press: "Escape" },
        { wait: "Discard ↵" },
        { press: "Escape" },
        { wait: "Close ×" },
        { press: "Escape" },
        { wait: "Discard ↵" },
      ],
    },
    "discard-extreme": {
      from: "review-extreme",
      about: "the same frame confirms discarding a fully answered round with long drafts",
      steps: [{ click: "Close ×" }, { hover: "Keep [esc]" }],
      extreme: true,
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
