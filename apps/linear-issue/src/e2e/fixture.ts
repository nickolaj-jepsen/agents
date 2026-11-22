/** What the linear-issue scenarios share: a repository, the drafting model's answers and the stand-in Linear server. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Turn } from "../lib/harness.ts";
import { LISTED } from "../lib/linear-mcp.ts";
import type { Step } from "../lib/scenario.ts";
import type { SetupContext } from "../lib/session.ts";

export const NOTE = "the sync worker ignores Retry-After headers when it backs off after a 429";
export const TITLE = "Honor Retry-After when the sync worker backs off after a 429";

/** What the drafting model answers; linear-issue's own system prompt asks for this JSON. */
export const DRAFT = {
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

/** A draft with everything too long: wide characters, a table, code, more rows than fit. */
export const EXTREME = {
  ...DRAFT,
  title:
    "同期ワーカーが 429 の後に Retry-After を無視する: honor the header in every retry path, including the nightly reconciliation job and the manual resync command",
  description: [
    "The sync worker doubles its delay after every `429` and never reads `Retry-After`, so it retries sooner than the shop API allows and gets limited again. 再試行が早すぎるため、制限が解除されません。",
    "",
    "- Read `Retry-After` (seconds or an HTTP date) from the `429` response",
    "- Wait at least that long, then go back to the doubling delay",
    "  - 上限は `MAX_DELAY` のまま",
    "- [x] Reproduce it against the stub",
    "- [ ] Cap the wait at `MAX_DELAY`",
    "- [ ] Cover the nightly reconciliation job",
    "",
    "| Answer | Today | After |",
    "| --- | --- | --- |",
    "| `429` with `Retry-After: 30` | waits 2 seconds, then 4 | waits 30 seconds |",
    "| `429` alone | doubles | doubles |",
    "",
    "```sh",
    "curl -sI https://shop.example/api/orders?page=1&per_page=250&status=any | grep -i retry-after",
    "```",
    "",
    "**Where:** `src/sync.sh`, `src/config.sh`, `src/jobs/reconcile.sh`",
    "",
    "**Done when:** a `429` with `Retry-After: 30` makes the worker wait 30 seconds before its next try.",
  ].join("\n"),
  labels: ["Bug", "reliability", "Docs"],
};

export const NONE = '{"duplicate": null}';
/** One does, in the fake server's fixtures. */
export const DUPLICATE = JSON.stringify({
  duplicate: {
    issue: "PLT-212",
    comment:
      "The sync worker also ignores `Retry-After` on a `429`: it doubles its own delay, so it retries before the API allows.",
  },
});

/**
 * The drafter's answer, and the duplicate check's. Claude Code matches each to its own call;
 * pi's replay provider gives them in this order, which is the order they are asked in.
 */
export const drafting = (verdict: string, draft: object = DRAFT): Turn[] => [
  { match: "You draft a Linear issue", text: JSON.stringify(draft) },
  { match: "You check whether an open Linear issue", text: verdict },
];

/** A repository on GitHub, so the draft names where it came from. */
export const repo = (ctx: SetupContext) => {
  ctx.write("README.md", "# sync-worker\n");
  ctx.write("src/sync.sh", "#!/bin/sh\n# Fetches a page of orders, backing off on 429.\n");
  ctx.write("src/config.sh", "SHOP_API=https://shop.example/api\nMAX_DELAY=60\n");
  ctx.initRepo();
  ctx.git("remote", "add", "origin", "https://github.com/acme/sync-worker.git");
  ctx.git("checkout", "-q", "-b", "fix/retry-after");
};

/**
 * Until the fake Linear server has listed its tools. It starts with the session, and a /linear
 * typed before Claude Code has its tools answers that no Linear server is configured.
 */
export const LINEAR_UP: Step = {
  run: async (s) => {
    for (let i = 0; i < 150 && !existsSync(join(s.runDir, LISTED)); i++)
      await new Promise((r) => setTimeout(r, 100));
    // The list reaches the session a moment after the server answers it.
    await new Promise((r) => setTimeout(r, 300));
  },
};
