import { vscodeScenarios } from "@agents/drive/lib/vscode-scenario.ts";
import {
  APPS,
  checkout,
  ENV,
  extreme,
  outside,
  withLargeNote,
  withLongNote,
  withNotes,
  writtenDuringTurn,
} from "./fixture.ts";

const open = [{ type: "/notes" }, { press: "Enter" }];

/** One stubbed reply, so the session starts: it starts on the first prompt or slash command. */
const reply = { turns: [{ text: "Hello from the stub." }], env: ENV, ...APPS };

export default vscodeScenarios({
  plugin: "notes",
  harness: "vscode",
  scenarios: {
    list: {
      about: "/notes: notes under their folders with their ages, each with Read or Open",
      setup: withNotes,
      start: reply,
      steps: [...open, { wait: "retry-after.md" }],
    },
    empty: {
      about: "/notes in a checkout whose store holds nothing yet",
      setup: checkout,
      start: reply,
      steps: [...open, { wait: "No notes yet" }],
    },
    outside: {
      about: "/notes in a folder in no git repository",
      setup: outside,
      start: reply,
      steps: [...open, { wait: "no git repository" }],
    },
    extreme: {
      about: "more notes than a pane shows at once, long paths and wide characters",
      setup: extreme,
      start: reply,
      steps: [...open, { wait: "findings" }],
    },
    reader: {
      about: "a long Markdown note read in the pane, Back and Open in its toolbar",
      setup: withLongNote,
      start: reply,
      steps: [...open, { wait: "retry-after.md" }, { click: "Read" }, { wait: "Open questions" }],
    },
    large: {
      about: "a note over 256 KiB: the pane says so, and Open is the lit button",
      setup: withLargeNote,
      start: reply,
      steps: [...open, { wait: "sync-run.md" }, { click: "Read" }, { wait: "too large" }],
    },
    band: {
      about:
        "the line above the prompt after a turn, Read and Dismiss: the note stands in for one the turn wrote (its time is a few minutes ahead), since Claude Code's question before a write through the link takes the panel from the driver",
      setup: writtenDuringTurn,
      start: reply,
      steps: [
        { type: "hello" },
        { press: "Enter" },
        { wait: "Note written: plans/backoff.md", timeout: 30_000 },
      ],
    },
  },
});
