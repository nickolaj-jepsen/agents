import type { Turn } from "../lib/harness.ts";
import { linearMcp } from "../lib/linear-mcp.ts";
import type { SetupContext } from "../lib/session.ts";
import { vscodeScenarios } from "../lib/vscode-scenario.ts";

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
      about: "a draft with three labels, each a quiet button that removes itself",
      setup: repo,
      start: start(draft({ labels: ["Bug", "Feature", "reliability"] })),
      steps: drafted,
    },
    team: {
      about: "another team picked: its statuses and projects load, and the labels it also has stay",
      setup: repo,
      start: start(draft({ labels: ["Bug", "Feature", "reliability"] })),
      steps: [
        ...drafted,
        {
          // The Select is a native one: set it and raise the change the page listens for.
          run: async (v) => {
            await v.evalInView(
              `(() => { const s = document.querySelector("select"); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, "MOB"); s.dispatchEvent(new Event("change", { bubbles: true })); })()`,
            );
          },
        },
        { sleep: 2000 },
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
      about:
        "an open issue already covers it: a folded row, one line, between the labels and the description",
      setup: repo,
      start: start(draft(), DUPLICATE),
      steps: [...drafted, { wait: "PLT-212" }],
    },
    "duplicate-open": {
      about: "the duplicate opened in place: the comment it would add, and Comment on this",
      from: "duplicate",
      steps: [{ click: "Open" }, { wait: "Comment on this" }],
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
        { wait: "Linear draft: " },
      ],
    },
  },
});
