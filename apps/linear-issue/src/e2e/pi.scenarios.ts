import { fileURLToPath } from "node:url";
import { linearMcp } from "@agents/drive/lib/linear-mcp.ts";
import { scenarios, type Step } from "@agents/drive/lib/scenario.ts";
import { region } from "@agents/drive/lib/screen.ts";
import { DRAFT, DUPLICATE, EXTREME, NONE, NOTE, drafting, repo } from "./fixture.ts";

/** /linear with a note, until the draft is on screen. */
const drafted: Step[] = [
  { type: `/linear ${NOTE}` },
  { press: "Enter" },
  { wait: "Then open in Linear", timeout: 60_000 },
];
/** And until the search for a duplicate has its answer. */
const settled: Step[] = [...drafted, { wait: "Looking for an issue", gone: true, timeout: 30_000 }];

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
  harness: "pi",
  // The sheet alone: its box, standing on the rule over the prompt.
  region: region.standing,
  // The session's id is in the line saying where the draft came from.
  mask: [{ pattern: /session [0-9a-f-]{6,}/g, with: "session id" }],
  scenarios: {
    draft: {
      about: "/linear with a note: the draft in a sheet standing on the prompt's rule",
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
      steps: [{ sleep: 800 }, { press: "Enter" }, { wait: "Send comment" }],
    },
    priority: {
      about: "p: the priorities open under their row, the one set under the pointer",
      from: "draft",
      steps: [{ press: "p" }, { wait: "No priority" }],
    },
    labels: {
      about: "l, then b: the labels open under their row, a second one ticked",
      from: "draft",
      steps: [{ press: "l" }, { wait: "Improvement" }, { press: "b" }],
    },
    title: {
      about: "e: the title in pi's own field, in the row it stood in",
      from: "draft",
      steps: [{ press: "e" }, { wait: "Save" }],
    },
    body: {
      about: "x: the description as the Markdown it is filed as, in pi's own editor",
      from: "draft",
      steps: [{ press: "x" }, { wait: "new line" }],
    },
    discard: {
      about: "d: the buttons' row asks before the draft goes",
      from: "draft",
      steps: [{ press: "d" }, { wait: "Discard draft?" }],
    },
    hover: {
      about: "the pointer on a field: its value is bold",
      from: "draft",
      steps: [{ hover: "Priority" }],
    },
    drafting: {
      about: "the draft being written: what it waits for, and the note it is written from",
      setup: repo,
      // Signed out, the server lists no tool that files: the draft waits for one, then fails.
      start: { ...start(NONE), mcp: signedOut },
      steps: [{ type: `/linear ${NOTE}` }, { press: "Enter" }, { wait: "Reading your teams" }],
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
    scrolled: {
      about: "the description scrolled: rows at both its edges count what is past them",
      from: "extreme",
      // Short enough that the description does not fit.
      size: [112, 28],
      sizes: [[112, 28]],
      fresh: true,
      steps: [{ press: ["Down", "Down"] }, { wait: /↑ \d+ more/ }],
    },
    chip: {
      about: "esc: the draft put aside, a line above the prompt with Open and Discard to press",
      from: "draft",
      // The mark alone names the line: a narrow terminal drops its "Linear draft".
      region: region.rows(/^✎/, /^✎/),
      steps: [{ press: "Escape" }, { wait: "Open [/linear]" }],
    },
    armed: {
      about: "a press on the line's Discard: it asks once more before the draft goes",
      from: "chip",
      region: region.rows(/^✎/, /^✎/),
      steps: [{ click: "Discard" }, { wait: "Sure? Discard" }],
    },
    filed: {
      about: "enter: the issue filed, a row in the transcript with where it is",
      from: "draft",
      region: region.rows(/PLT-\d+/, /linear\.app/),
      steps: [{ sleep: 800 }, { press: "Enter" }, { wait: "linear.app", timeout: 30_000 }],
    },
  },
});
