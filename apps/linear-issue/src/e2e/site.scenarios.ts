import type { Turn } from "@agents/drive/lib/harness.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { LISTED, linearMcp } from "@agents/drive/lib/linear-mcp.ts";
import type { Step } from "@agents/drive/lib/scenario.ts";
import type { SetupContext } from "@agents/drive/lib/session.ts";
import { poster, site, slow } from "@agents/drive/lib/site.ts";

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

/**
 * Until the fake Linear server has listed its tools. It starts with the session, and a /linear
 * typed before Claude Code has its tools answers that no Linear server is configured.
 */
const LINEAR_UP: Step = {
  run: async (s) => {
    for (let i = 0; i < 150 && !existsSync(join(s.runDir, LISTED)); i++)
      await new Promise((r) => setTimeout(r, 100));
    // The list reaches the session a moment after the server answers it.
    await new Promise((r) => setTimeout(r, 300));
  },
};

/** /linear with a note, until the draft is on screen. */
const DRAFTED: Step[] = [
  LINEAR_UP,
  { type: `/linear ${NOTE}` },
  { press: "Enter" },
  { wait: "Then open in Linear", timeout: 60_000 },
];

export default site({
  plugin: "linear-issue",
  demo: {
    caption:
      "/linear drafts an issue from a note: a title, lettered fields that open under their row, and a description. Esc puts the draft aside, 8 brings it back.",
    project: "sync-worker",
    setup: repo,
    start: start(NONE),
    steps: [
      { sleep: 500 },
      slow(`/linear ${NOTE}`),
      { press: "Enter" },
      { wait: "Then open in Linear", timeout: 60_000 },
      { sleep: 2800 },
      poster,
      // A field's letter opens its choices under it; a choice's letter picks.
      { press: "p" },
      { sleep: 1400 },
      { press: "b" },
      { sleep: 1400 },
      // The title, in the engine's own field.
      { press: "e" },
      { sleep: 900 },
      slow(" first"),
      { sleep: 900 },
      { press: "Enter" },
      { sleep: 1400 },
      // Esc puts the draft aside; 8 brings it back.
      { press: "Escape" },
      { wait: /Linear draft.*Open \[8\]/ },
      { sleep: 2200 },
      { press: "8" },
      { wait: "Then open in Linear" },
      { sleep: 2800 },
    ],
  },
  stills: {
    draft: {
      caption:
        "The draft arrives filled in: title, team, status, priority, labels and a description. A field's letter opens its choices; Enter creates the issue.",
      project: "sync-worker",
      setup: repo,
      start: start(NONE),
      steps: DRAFTED,
    },
    duplicate: {
      caption:
        "When an open issue may already cover it, the draft says so, and Enter goes to the choice between a comment there and the new issue.",
      project: "sync-worker",
      setup: repo,
      start: start(DUPLICATE),
      steps: [...DRAFTED, { wait: "may already cover this", timeout: 30_000 }],
    },
    chip: {
      caption:
        "Esc puts the draft aside as a line above the prompt; 8 reopens it, 9 twice discards it.",
      project: "sync-worker",
      setup: repo,
      start: start(NONE),
      steps: [...DRAFTED, { press: "Escape" }, { wait: /Linear draft.*Open \[8\]/ }],
    },
  },
  vscode: {
    draft: {
      caption:
        "In VS Code the draft is a pane beside the chat: title, status, priority, labels and description, ready to create.",
      scenario: "draft",
    },
    duplicate: {
      caption:
        "When an open issue may already cover it, a warning leads the draft, with the issue to open.",
      scenario: "duplicate",
    },
  },
});
