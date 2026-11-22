import type { Turn } from "@agents/drive/lib/harness.ts";
import { linearMcp } from "@agents/drive/lib/linear-mcp.ts";
import type { SetupContext } from "@agents/drive/lib/session.ts";
import { vscodeScenarios } from "@agents/drive/lib/vscode-scenario.ts";

const NOTE = "the sync worker ignores Retry-After headers when it backs off after a 429";
const TITLE = "Honor Retry-After when the sync worker backs off after a 429";

const DESCRIPTION = [
  "The sync worker doubles its delay after every `429` and never reads `Retry-After`, so it retries sooner than the shop API allows and gets limited again.",
  "",
  "- Read `Retry-After` (seconds or an HTTP date) from the `429` response",
  "- Wait at least that long, then go back to the doubling delay",
  "- Cap the wait at `MAX_DELAY`",
  "",
  "**Where:** `src/sync.sh`, `src/config.sh`",
  "",
  "**Done when:** a `429` with `Retry-After: 30` makes the worker wait 30 seconds before its next try.",
].join("\n");

/** What the drafting model answers; linear-issue's own system prompt asks for this JSON. */
const draft = (over: Record<string, unknown> = {}) => ({
  team: "PLT",
  title: TITLE,
  description: DESCRIPTION,
  priority: 3,
  labels: ["Bug"],
  search: ["Retry-After", "429 backoff"],
  ...over,
});

const NONE = '{"duplicate": null}';
const DUPLICATE = JSON.stringify({
  duplicate: {
    issue: "PLT-212",
    comment:
      "The sync worker also ignores `Retry-After` on a `429`: it doubles its own delay, so it retries before the API allows.",
  },
});

const drafting = (answer: object, verdict: string): Turn[] => [
  { match: "You draft a Linear issue", text: JSON.stringify(answer) },
  { match: "You check whether an open Linear issue", text: verdict },
  { text: "Hello from the stub." },
];

const repo = (ctx: SetupContext) => {
  ctx.write("README.md", "# sync-worker\n");
  ctx.write("src/sync.sh", "#!/bin/sh\n# Fetches a page of orders, backing off on 429.\n");
  ctx.initRepo();
  ctx.git("remote", "add", "origin", "https://github.com/acme/sync-worker.git");
  ctx.git("checkout", "-q", "-b", "fix/retry-after");
};

/** The stand-in Linear server signed out: a Linear server, but none that can file. */
const signedOut = {
  linear: {
    command: process.execPath,
    args: [new URL("signed-out-mcp.ts", import.meta.url).pathname],
  },
};

/** Sets the native Select that is `nth` in the pane and raises the change the page listens for. */
const pick = (nth: number, value: string) =>
  `(() => { const s = document.querySelectorAll("select")[${nth}]; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, "${value}"); s.dispatchEvent(new Event("change", { bubbles: true })); })()`;

/** Types into the Input whose placeholder is `placeholder`, as the page's own change does. */
const fill = (placeholder: string, text: string) =>
  `(() => { const i = document.querySelector('input[placeholder="${placeholder}"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event("input", { bubbles: true })); })()`;

const start = (answer: object, verdict = NONE) => ({
  mcp: linearMcp,
  turns: drafting(answer, verdict),
});

/** /linear with a note, until the draft is on screen. */
const drafted = [
  { type: `/linear ${NOTE}` },
  { press: "Enter" },
  { wait: "Create & open", timeout: 60_000 },
];

export default vscodeScenarios({
  plugin: "linear-issue",
  harness: "vscode",
  scenarios: {
    draft: {
      about: "/linear with a note: the draft, filled in, in the pane",
      setup: repo,
      start: start(draft()),
      steps: drafted,
    },
    labels: {
      about: "a draft with three labels: one Labels property, the names after it",
      setup: repo,
      start: start(draft({ labels: ["Bug", "Feature", "reliability"] })),
      steps: drafted,
    },
    edit: {
      about: "Edit pressed: the title in its field, in place of the heading, with Done",
      setup: repo,
      start: start(draft()),
      steps: [...drafted, { click: "Edit" }, { wait: "Done" }],
    },
    priority: {
      about: "the priority pressed: its Select in place of the value, with Done",
      setup: repo,
      start: start(draft()),
      steps: [...drafted, { click: "Medium" }, { wait: "Done" }],
    },
    team: {
      about: "another team picked: its statuses and projects load, its labels stay",
      setup: repo,
      start: start(draft({ labels: ["Bug", "Feature", "reliability"] })),
      steps: [
        ...drafted,
        { click: "Platform (PLT)" },
        { wait: "Done" },
        // The Select is a native one: set it and raise the change the page listens for.
        { run: async (v) => void (await v.evalInView(pick(0, "MOB"))) },
        { sleep: 2000 },
      ],
    },
    "labels-edit": {
      about: "the labels pressed: each turned off or on, the field that finds another",
      setup: repo,
      start: start(draft({ labels: ["Bug", "Feature", "reliability"] })),
      steps: [...drafted, { click: "Bug, Feature, Area/reliability" }, { wait: "Done" }],
    },
    "label-search": {
      about: "a label being found: what is typed offers the labels that match, a press adds one",
      setup: repo,
      start: start(draft()),
      steps: [
        ...drafted,
        { click: "Bug" },
        { wait: "Done" },
        { run: async (v) => void (await v.evalInView(fill("Find a label to add", "per"))) },
        { wait: "Area/performance" },
      ],
    },
    "long-title": {
      about:
        "a title far longer than a line: whole under the heading, a one-line field when edited",
      setup: repo,
      start: start(
        draft({
          title:
            "Honor Retry-After on every 429 from the shop API in the sync worker, the webhook relay and the nightly reconciliation job, and cap the wait at MAX_DELAY",
        }),
      ),
      steps: drafted,
    },
    drafting: {
      about: "the draft being written: one line and Discard (Linear signed out, so it waits)",
      setup: repo,
      start: { mcp: signedOut, turns: drafting(draft(), NONE) },
      steps: [{ type: `/linear ${NOTE}` }, { press: "Enter" }, { wait: "Drafting the issue" }],
    },
    failed: {
      about: "drafting failed: what went wrong, in the error colour, and Discard",
      setup: repo,
      start: { mcp: signedOut, turns: drafting(draft(), NONE) },
      steps: [
        { type: `/linear ${NOTE}` },
        { press: "Enter" },
        { wait: "Linear draft failed", timeout: 60_000 },
      ],
    },
    long: {
      about: "a description far longer than the pane: shown whole, the pane scrolls",
      setup: repo,
      start: start(
        draft({
          description: Array.from(
            { length: 14 },
            (_, i) =>
              `- Step ${i + 1}: change \`src/step${i + 1}.sh\` and check the \`429\` path still waits`,
          ).join("\n"),
        }),
      ),
      steps: drafted,
    },
    duplicate: {
      about: "an open issue may already cover it: a warning row first in the pane, over the issue",
      setup: repo,
      start: start(draft(), DUPLICATE),
      steps: [...drafted, { wait: "PLT-212" }],
    },
    "duplicate-open": {
      about: "the duplicate opened in place: its title, the comment it would add, Comment instead",
      from: "duplicate",
      steps: [{ click: "Open" }, { wait: "Comment instead" }],
    },
    filed: {
      about: "Create pressed: the pane closes and a success line stays above the prompt",
      setup: repo,
      start: start(draft()),
      steps: [...drafted, { click: "Create" }, { wait: "Copy link", timeout: 30_000 }],
    },
    chip: {
      about: "the draft hidden: a line above the prompt with Open and Discard",
      setup: repo,
      start: start(draft()),
      steps: [
        ...drafted,
        // The host's own close mark: Escape in the field only leaves it.
        {
          run: async (v) => {
            await v.evalInView('document.querySelector("[aria-label=Close]")?.click()');
          },
        },
        { wait: "Discard" },
      ],
    },
  },
});
