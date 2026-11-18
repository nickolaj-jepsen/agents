/**
 * Checkouts for git-menu's scenarios, and the programs a press may start. A press must reach only
 * stand-ins that write a line to `launched.log` beside the run's `bin`: nothing a scenario does
 * opens a real editor, file manager or forge.
 */
import { utimesSync } from "node:fs";
import { join } from "node:path";
import type { SetupContext } from "../lib/session.ts";

export const BRANCH = "feature/retry-after";
const HOUR = 3_600_000;

/** A repository on GitHub, a branch that is pushed (so a pull request can be asked about). */
export const checkout = (ctx: SetupContext, branch = BRANCH, mergeBase?: string) => {
  ctx.write("README.md", "# orders-api\n");
  ctx.initRepo();
  ctx.git("remote", "add", "origin", "https://github.com/acme/orders-api.git");
  ctx.git("checkout", "-q", "-b", branch);
  ctx.git("add", "README.md");
  ctx.git(
    "-c",
    "user.name=Alex Example",
    "-c",
    "user.email=alex@example.invalid",
    "commit",
    "-q",
    "-m",
    "Honor Retry-After in the sync worker",
  );
  ctx.git("update-ref", `refs/remotes/origin/${branch}`, "HEAD");
  ctx.git("config", `branch.${branch}.remote`, "origin");
  ctx.git("config", `branch.${branch}.merge`, `refs/heads/${branch}`);
  if (mergeBase) ctx.git("config", `branch.${branch}.gh-merge-base`, mergeBase);
};

/** Notes in the checkout's store, `[path, hours old]`, each with its modified time set. */
export const withNotes =
  (notes: readonly (readonly [string, number])[], branch?: string, mergeBase?: string) =>
  (ctx: SetupContext) => {
    // Before `git init`: a commit's hook links `.agents/store` into the person's own store, and
    // that link must never be written through.
    ctx.write(".agents/store/.keep", "");
    for (const [path, hours] of notes) {
      ctx.write(`.agents/store/${path}`, `# ${path}\n`);
      const at = new Date(Date.now() - hours * HOUR);
      utimesSync(join(ctx.cwd, ".agents/store", path), at, at);
    }
    checkout(ctx, branch, mergeBase);
  };

export const NOTES = [
  ["plans/retry-after.md", 1],
  ["plans/rate-limit.md", 5],
  ["notes/sync-worker.md", 26],
  ["research/queue-backpressure/REPORT.md", 80],
  ["notes/oncall-handoff.md", 400],
] as const;

export const MANY_NOTES = Array.from(
  { length: 20 },
  (_, i) => [`notes/session-${String(i + 1).padStart(2, "0")}.md`, i * 7 + 1] as const,
);

export const LONG_NOTES = [
  [
    "research/payments-reconciliation-and-ledger-drift/investigation/2026-11-with-a-very-long-descriptive-file-name-for-the-report-that-goes-on.md",
    2,
  ],
  ["plans/hub/PLAN.md", 3],
  ["日本語のメモ/決済システムの調査報告書と今後の移行計画についての詳細なメモ.md", 30],
] as const;

export const LONG_BASE = "release/2026-11-payments-integration-train-for-the-eu-region-rollout";

const log = (name: string) =>
  `#!/bin/sh\necho "${name} $*" >> "$(dirname "$0")/../launched.log"\nexit 0\n`;

/** `gh pr view` for a branch with an open pull request, answered without a network or an account. */
const ghPr = `#!/bin/sh\necho '{"url":"https://github.com/acme/orders-api/pull/12","number":12,"state":"OPEN","isDraft":false}'\n`;
/** `gh pr view` for a branch with no pull request yet. */
const ghNone = '#!/bin/sh\necho "no pull requests found for branch" >&2\nexit 1\n';

/** What a press may start: each writes its own name and arguments to `launched.log`. */
const apps = Object.fromEntries(
  ["code", "xdg-open", "nautilus", "ghostty", "agent-note-open"].map((n) => [n, log(n)]),
);

/** A machine with Code, a file manager and a terminal, and without Sublime Merge or Zed. */
const machine = { bin: apps, hide: ["smerge", "zed", "zeditor"] };

export const start = (gh: "pr" | "none") => ({
  turns: [{ text: "Hello from the stub." }],
  bin: { ...machine.bin, gh: gh === "pr" ? ghPr : ghNone },
  hide: machine.hide,
});
