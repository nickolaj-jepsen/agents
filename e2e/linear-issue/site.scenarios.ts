import type { Turn } from "../lib/harness.ts";
import { linearMcp } from "../lib/linear-mcp.ts";
import type { Step } from "../lib/scenario.ts";
import type { SetupContext } from "../lib/session.ts";
import { poster, site, slow, slowPress } from "../lib/site.ts";

const NOTE = "the sync worker ignores Retry-After headers when it backs off after a 429";
const TITLE = "Honor Retry-After when the sync worker backs off after a 429";

/** What the drafting model answers; linear-issue's own system prompt asks for this JSON. */
const DRAFT = {
  team: "PLT",
  title: TITLE,
  description: [
    "The sync worker doubles its delay after every `429` and never reads `Retry-After`, so it retries sooner than the shop API allows and gets limited again.",
    "",
    "- Read `Retry-After` (seconds or an HTTP date) from the `429` response",
    "- Wait at least that long, then go back to the doubling delay",
    "- Cap the wait at `MAX_DELAY`",
    "",
    "**Where:** `src/sync.sh`, `src/config.sh`",
    "",
    "**Done when:** a `429` with `Retry-After: 30` makes the worker wait 30 seconds before its next try.",
  ].join("\n"),
  priority: 3,
  labels: ["Bug"],
  search: ["Retry-After", "429 backoff"],
};

/** The drafter's answer, and the duplicate check's. */
const drafting = (verdict: string): Turn[] => [
  { match: "You draft a Linear issue", text: JSON.stringify(DRAFT) },
  { match: "You check whether an open Linear issue", text: verdict },
];

/** No open issue covers it. */
const NONE = '{"duplicate": null}';
/** One does, in the fake server's fixtures. */
const DUPLICATE = JSON.stringify({
  duplicate: {
    issue: "PLT-212",
    comment:
      "The sync worker also ignores `Retry-After` on a `429`: it doubles its own delay, so it retries before the API allows.",
  },
});

/** A repository on GitHub, so the draft names where it came from. */
const repo = (ctx: SetupContext) => {
  ctx.write("README.md", "# sync-worker\n");
  ctx.write("src/sync.sh", "#!/bin/sh\n# Fetches a page of orders, backing off on 429.\n");
  ctx.write("src/config.sh", "SHOP_API=https://shop.example/api\nMAX_DELAY=60\n");
  ctx.initRepo();
  ctx.git("remote", "add", "origin", "https://github.com/acme/sync-worker.git");
  ctx.git("checkout", "-q", "-b", "fix/retry-after");
};

const start = (verdict: string) => ({ hermetic: true, mcp: linearMcp, turns: drafting(verdict) });

/** /linear with a note, until the draft is on screen. */
const DRAFTED: Step[] = [
  { type: `/linear ${NOTE}` },
  { press: "Enter" },
  { wait: "Create & open", timeout: 60_000 },
];

export default site({
  plugin: "linear-issue",
  demo: {
    caption:
      "/linear drafts an issue from a note: team, priority, status, labels and a description you can edit. Esc hides the draft to a chip, 8 brings it back.",
    project: "sync-worker",
    setup: repo,
    start: start(NONE),
    steps: [
      { sleep: 500 },
      slow(`/linear ${NOTE}`, 25),
      { sleep: 500 },
      { press: "Enter" },
      { wait: "Create & open", timeout: 60_000 },
      { sleep: 2800 },
      poster,
      // The title field has the focus: cut its ending and write another.
      slowPress("Backspace", "backs off after a 429".length),
      { sleep: 600 },
      slow("retries after a 429", 70),
      { sleep: 1200 },
      // The first Esc leaves the field, the second hides the draft.
      { press: "Escape" },
      { sleep: 1200 },
      { press: "Escape" },
      { wait: /Linear draft: .*8: Open/ },
      { sleep: 2200 },
      { press: "8" },
      { wait: "Create & open" },
      { sleep: 2800 },
    ],
  },
  stills: {
    draft: {
      caption:
        "The draft arrives filled in: title, team, priority, status, labels and a description. Every field is editable.",
      project: "sync-worker",
      setup: repo,
      start: start(NONE),
      steps: DRAFTED,
    },
    duplicate: {
      caption:
        "When an open issue already covers it, the draft offers a comment on that issue instead of a second one.",
      project: "sync-worker",
      setup: repo,
      start: start(DUPLICATE),
      steps: [...DRAFTED, { wait: "Comment on PLT-212", timeout: 30_000 }],
    },
    chip: {
      caption: "Esc hides the draft to a chip above the prompt; 8 reopens it, 9 twice discards it.",
      project: "sync-worker",
      setup: repo,
      start: start(NONE),
      steps: [
        ...DRAFTED,
        { press: "Escape" },
        { press: "Escape" },
        { wait: /Linear draft: .*8: Open/ },
      ],
    },
  },
});
