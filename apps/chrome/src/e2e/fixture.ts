/**
 * The checkouts the frame's scenarios run in. A fixture of its own, with git deaf to the person's
 * configuration (`FIXTURE_GIT_ENV` in the driver), so no scenario touches a real repository, hook
 * or notes store.
 */
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
