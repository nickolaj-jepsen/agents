/**
 * The checkouts the frame's scenarios run in. A fixture of its own, with git deaf to the person's
 * configuration (`FIXTURE_GIT_ENV` in the driver), so no scenario touches a real repository, hook
 * or notes store.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { RUN_DIR } from "@agents/drive/lib/setup.ts";
import type { SetupContext } from "@agents/drive/lib/session.ts";

/** A branch whose name says what the session is doing, in a repository that is not pushed. */
export const BRANCH = "feature/frame-extract";

/** A clean repository on its own branch: the branch, and no dirty mark beside it. */
export const checkout = (ctx: SetupContext, branch = BRANCH) => {
  ctx.write("README.md", "# orders-api\n");
  ctx.initRepo();
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
    "Extract the frame",
  );
};

/** One file written but not staged, and one the repository does not know: the dirty mark. */
export const dirty = (ctx: SetupContext) => {
  checkout(ctx);
  ctx.write("README.md", "# orders-api\n\nThe retry honours Retry-After.\n");
  ctx.write("notes.txt", "call the forge about the release\n");
};

/** The same checkout with a GitHub remote, for a press that opens the git sheet. */
export const withRemote = (ctx: SetupContext) => {
  checkout(ctx);
  ctx.git("remote", "add", "origin", "https://github.com/acme/orders-api.git");
};

/** A folder that is no repository: the footer keeps its words and draws no branch. */
export const plain = (ctx: SetupContext) => {
  ctx.write("README.md", "# a folder, not a checkout\n");
};

/**
 * A branch long enough to squeeze the line at 70 columns, in a checkout whose folder name is not
 * the branch, so the name is worth its columns.
 */
export const LONG_BRANCH = "release/2026-11-payments-integration-train-for-the-eu-region";

/**
 * A hermetic session with a canned reply (`turns` is what a hermetic run needs). The frame draws
 * its own footer, which is where pi's context meter would have been: the driver is told what a
 * ready prompt looks like here.
 */
export const start = {
  hermetic: true,
  turns: [{ text: "The frame is drawn by the chrome plugin." }],
  ready: /Replay \(fixture\)/,
};

/** The same checkout with its HEAD detached, so the footer has no branch name to show. */
export const detached = (ctx: SetupContext) => {
  checkout(ctx);
  ctx.git("checkout", "-q", "--detach", "HEAD");
};

/** A changed file that is staged but not committed: the branch's mark is the quieter one. */
export const staged = (ctx: SetupContext) => {
  checkout(ctx);
  ctx.write("README.md", "# orders-api\n\nThe retry honours Retry-After.\n");
  ctx.git("add", "README.md");
};

/**
 * A merge in progress that stopped on a conflict: the footer has an operation to name, a conflict
 * count, and a branch that is still checked out.
 */
export const merging = (ctx: SetupContext) => {
  checkout(ctx);
  ctx.git("checkout", "-q", "-b", "feature/retry-policy");
  ctx.write("README.md", "# orders-api\n\nRetry twice, then give up.\n");
  ctx.git("commit", "-q", "-am", "Retry twice");
  ctx.git("checkout", "-q", BRANCH);
  ctx.write("README.md", "# orders-api\n\nRetry five times, with jitter.\n");
  ctx.git("commit", "-q", "-am", "Retry with jitter");
  try {
    ctx.git("merge", "feature/retry-policy");
  } catch {
    // The conflict is the fixture: git exits non-zero and leaves MERGE_HEAD behind.
  }
};

/** A branch whose name is wide characters, so the row's measure is cells and not characters. */
export const WIDE_BRANCH = "功能/重构分支名称很长";
export const wideBranch = (ctx: SetupContext) => checkout(ctx, WIDE_BRANCH);

/**
 * `git` and its identity for a scenario where the session itself runs git: the person's global and
 * system configuration stay out of it, as they do for the fixture's own commits.
 */
export const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "e2e",
  GIT_AUTHOR_EMAIL: "e2e@example.invalid",
  GIT_COMMITTER_NAME: "e2e",
  GIT_COMMITTER_EMAIL: "e2e@example.invalid",
};

/**
 * A configuration file of the host's own beside the checkout, and the variable that names it: what
 * a machine's Home Manager would write for the frame. `config` is the JSON text, so a scenario can
 * hand in one that parses and one that does not.
 */
export const withConfig = (config: string) => (ctx: SetupContext) => {
  checkout(ctx);
  writeFileSync(join(ctx.runDir, "chrome.json"), config);
};

/** Where a scenario's `PI_CHROME_CONFIG` points: the run's own folder, never the person's. */
export const CONFIG_ENV = { PI_CHROME_CONFIG: `${RUN_DIR}/chrome.json` };

/**
 * A rebase stopped on a conflict: git leaves `rebase-merge/` with its step, and HEAD detached
 * until it is finished or aborted.
 */
export const rebasing = (ctx: SetupContext) => {
  checkout(ctx);
  ctx.git("checkout", "-q", "-b", "feature/retry-policy");
  ctx.write("README.md", "# orders-api\n\nRetry twice, then give up.\n");
  ctx.git("commit", "-q", "-am", "Retry twice");
  ctx.git("checkout", "-q", BRANCH);
  ctx.write("README.md", "# orders-api\n\nRetry five times, with jitter.\n");
  ctx.git("commit", "-q", "-am", "Retry with jitter");
  try {
    ctx.git("rebase", "feature/retry-policy");
  } catch {
    // The conflict is the fixture: git stops and leaves the rebase in progress.
  }
};

/** A cherry-pick stopped on a conflict: git leaves `CHERRY_PICK_HEAD` behind. */
export const cherryPicking = (ctx: SetupContext) => {
  checkout(ctx);
  ctx.git("checkout", "-q", "-b", "feature/retry-policy");
  ctx.write("README.md", "# orders-api\n\nRetry twice, then give up.\n");
  ctx.git("commit", "-q", "-am", "Retry twice");
  ctx.git("checkout", "-q", BRANCH);
  ctx.write("README.md", "# orders-api\n\nRetry five times, with jitter.\n");
  ctx.git("commit", "-q", "-am", "Retry with jitter");
  try {
    ctx.git("cherry-pick", "feature/retry-policy");
  } catch {
    // A conflicting pick stops with CHERRY_PICK_HEAD, which is the state to draw.
  }
};

/** A revert stopped on a conflict: git leaves `REVERT_HEAD` behind. */
export const reverting = (ctx: SetupContext) => {
  checkout(ctx);
  ctx.write("README.md", "# orders-api\n\nRetry twice, then give up.\n");
  ctx.git("commit", "-q", "-am", "Retry twice");
  ctx.write("README.md", "# orders-api\n\nRetry five times, with jitter.\n");
  ctx.git("commit", "-q", "-am", "Retry with jitter");
  try {
    ctx.git("revert", "--no-edit", "HEAD~1");
  } catch {
    // Reverting the older change over the newer one stops with REVERT_HEAD.
  }
};
