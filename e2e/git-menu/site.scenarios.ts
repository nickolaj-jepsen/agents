import type { Turn } from "../lib/harness.ts";
import type { Step } from "../lib/scenario.ts";
import type { SetupContext } from "../lib/session.ts";
import { poster, site, slow } from "../lib/site.ts";

const BRANCH = "feature/retry-after";

/** A repository on GitHub with a branch that is pushed, and a few notes in its store. */
const repo = (ctx: SetupContext) => {
  ctx.write("README.md", "# orders-api\n");
  ctx.write("src/sync.ts", "export const backoff = () => 1;\n");
  ctx.write(".agents/store/plans/retry-after.md", "# Honor Retry-After\n");
  ctx.write(".agents/store/plans/rate-limit.md", "# Rate limiting\n");
  ctx.write(".agents/store/notes/sync-worker.md", "# Sync worker\n");
  ctx.initRepo();
  ctx.git("remote", "add", "origin", "https://github.com/acme/orders-api.git");
  ctx.git("checkout", "-q", "-b", BRANCH);
  ctx.git("add", "src", "README.md");
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
  // Pushed: the remote branch and the tracking config, without a remote to push to.
  ctx.git("update-ref", `refs/remotes/origin/${BRANCH}`, "HEAD");
  ctx.git("config", `branch.${BRANCH}.remote`, "origin");
  ctx.git("config", `branch.${BRANCH}.merge`, `refs/heads/${BRANCH}`);
};

const turns: Turn[] = [
  { text: "Committed on `feature/retry-after`: the sync worker now honors `Retry-After`." },
];
/** `gh pr view` for a branch with no pull request yet, answered without a network or an account. */
const gh = '#!/bin/sh\necho "no pull requests found for branch" >&2\nexit 1\n';
const start = { hermetic: true, turns, bin: { gh } };
const EXCHANGE: Step[] = [
  { type: "Commit the Retry-After fix" },
  { press: "Enter" },
  { wait: "now honors", timeout: 20_000 },
];

export default site({
  plugin: "git-menu",
  demo: {
    caption:
      "/git opens the repository, branch or a pull request on the forge; /open hands the checkout, or one of its notes, to an editor.",
    project: "orders-api",
    setup: repo,
    start,
    prepare: EXCHANGE,
    steps: [
      { sleep: 500 },
      slow("/git"),
      { press: "Enter" },
      { wait: "Open repository" },
      { sleep: 1500 },
      { hover: "Open branch" },
      { sleep: 1800 },
      { hover: "Create pull request" },
      { sleep: 2200 },
      poster,
      { press: "Escape" },
      { sleep: 700 },
      slow("/open"),
      { press: "Enter" },
      { wait: "Open folder" },
      { sleep: 1500 },
      { hover: "Sublime Merge" },
      { sleep: 2200 },
      { press: "Escape" },
      { sleep: 700 },
      slow("/open plan"),
      { press: "Enter" },
      { wait: "retry-after.md" },
      { sleep: 4000 },
    ],
  },
  stills: {
    git: {
      caption:
        "/git: the repository, the branch and a new pull request on GitHub, GitLab or Codeberg.",
      project: "orders-api",
      setup: repo,
      start,
      steps: [...EXCHANGE, { type: "/git" }, { press: "Enter" }, { wait: "Open repository" }],
    },
    folder: {
      caption: "/open: this checkout in an editor, the file manager or a terminal.",
      project: "orders-api",
      setup: repo,
      start,
      steps: [...EXCHANGE, { type: "/open" }, { press: "Enter" }, { wait: "Open folder" }],
    },
    notes: {
      caption: "/open plan: the checkout's notes, newest first, for the editor.",
      project: "orders-api",
      setup: repo,
      start,
      steps: [...EXCHANGE, { type: "/open plan" }, { press: "Enter" }, { wait: "retry-after.md" }],
    },
  },
  vscode: {
    git: {
      caption:
        "In VS Code, /git is a pane beside the chat: the repository, the branch and its pull request.",
      scenario: "git",
    },
  },
});
