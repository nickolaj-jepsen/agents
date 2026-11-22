import { fileURLToPath } from "node:url";
import { linearMcp } from "@agents/drive/lib/linear-mcp.ts";
import { scenarios, slashCommand, type Step } from "@agents/drive/lib/scenario.ts";
import { region } from "@agents/drive/lib/screen.ts";
import { DRAFT, DUPLICATE, EXTREME, LINEAR_UP, NONE, NOTE, drafting, repo } from "./fixture.ts";

/** /linear with a note, until the draft is on screen. */
const drafted: Step[] = [
  LINEAR_UP,
  slashCommand("linear", "Draft a Linear issue"),
  { type: ` ${NOTE}` },
  { press: "Enter" },
  { wait: "Then open in Linear", timeout: 60_000 },
];
/** And until the search for a duplicate has its answer. */
const settled: Step[] = [...drafted, { wait: "Looking for an issue", gone: true, timeout: 30_000 }];

// Snapshot sizes can cross the box/sidebar boundary and return the keyboard to the prompt.
// Clicking the pane title gives the keyboard back without activating a draft control.
const paneKeys: Step = { click: "Linear draft" };

/** The stand-in server signed out: it lists only the tool that signs in. */
const signedOut = {
  linear: {
    command: process.execPath,
    args: [fileURLToPath(new URL("./signed-out-mcp.ts", import.meta.url))],
  },
};

const start = (verdict: string, draft: object = DRAFT) => ({
  hermetic: true,
  plugins: ["linear-issue"],
  mcp: linearMcp,
  turns: drafting(verdict, draft),
});

export default scenarios({
  plugin: "linear-issue",
  harness: "claude",
  // Below 110 columns the pane is a box over the prompt, from 110 a column beside the transcript.
  region: region.any(region.sidebar, region.box()),
  // The session's id is in the line saying where the draft came from.
  mask: [{ pattern: /session [0-9a-f-]{6,}/g, with: "session id" }],
  scenarios: {
    draft: {
      about: "/linear with a note: the draft in the pane",
      setup: repo,
      start: start(NONE),
      steps: settled,
    },
    duplicate: {
      about: "an open issue may already cover it: the row over the buttons says so",
      setup: repo,
      start: start(DUPLICATE),
      steps: [...drafted, { wait: "may already cover this", timeout: 30_000 }],
    },
    decide: {
      about: "enter on a duplicate: the issue there is, and the comment or the new issue to send",
      from: "duplicate",
      // An Enter right after the duplicate is found is not taken: it was typed for Create.
      steps: [{ sleep: 800 }, paneKeys, { press: "Enter" }, { wait: "Send comment" }],
    },
    priority: {
      about: "p: the priorities open under their row, the one set under the pointer",
      from: "draft",
      steps: [paneKeys, { press: "p" }, { wait: "No priority" }],
    },
    labels: {
      about: "l, then b: the labels open under their row, a second one ticked",
      from: "draft",
      steps: [{ press: "l" }, { wait: "Improvement" }, { press: "b" }],
    },
    title: {
      about: "e: the title in the engine's own field, in the row it stood in",
      from: "draft",
      // The field's own hint shows once the ring is on it.
      steps: [{ press: "e" }, { wait: "Save" }, { wait: "shift+⏎" }],
    },
    body: {
      about: "x: the description as the Markdown it is filed as, in the engine's own field",
      from: "draft",
      // The field's own hint shows once the ring is on it.
      steps: [{ press: "x" }, { wait: "Save" }, { wait: "shift+⏎" }],
    },
    discard: {
      about: "d: the buttons' row asks before the draft goes",
      from: "draft",
      steps: [{ press: "d" }, { wait: "Discard draft?" }],
    },
    inline: {
      about: "the pane as a box over the prompt, at 100 columns: the fields side by side",
      from: "draft",
      size: [100, 36],
      sizes: [[100, 36]],
    },
    drafting: {
      about: "the draft being written: what it waits for, and the note it is written from",
      setup: repo,
      // Signed out, the server lists no tool that files: the draft waits for one, then fails.
      start: { ...start(NONE), mcp: signedOut },
      steps: [
        LINEAR_UP,
        slashCommand("linear", "Draft a Linear issue"),
        { type: ` ${NOTE}` },
        { press: "Enter" },
        { wait: "Reading your teams" },
      ],
    },
    failed: {
      about: "the draft was not written: why, the note it had, and Try again",
      from: "drafting",
      steps: [{ wait: "The draft was not written", timeout: 40_000 }],
    },
    extreme: {
      about: "a long title, wide characters, a table, code and more rows than fit",
      setup: repo,
      start: start(DUPLICATE, EXTREME),
      steps: [...drafted, { wait: "may already cover this", timeout: 30_000 }],
      extreme: true,
    },
    chip: {
      about: "esc: the draft put aside, a line above the prompt with its digits",
      from: "draft",
      // The mark alone names the line: a narrow terminal drops its "Linear draft".
      region: region.rows(/^✎/, /^✎/),
      steps: [{ press: "Escape" }, { wait: /Open \[8\]/ }],
    },
    filed: {
      about: "enter: the issue filed, a line above the prompt with where it is",
      from: "draft",
      region: region.rows(/PLT-\d+/, /PLT-\d+/),
      steps: [{ sleep: 800 }, { press: "Enter" }, { wait: /PLT-\d+/, timeout: 30_000 }],
    },
  },
});
