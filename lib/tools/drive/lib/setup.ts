/** The folder a scenario's `setup` fills, shared by the terminal and VS Code drivers. */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** What a scenario's `setup` gets to fill the folder the agent runs in. */
export type SetupContext = {
  /** The agent's working directory, empty and its own. */
  cwd: string;
  /** Scratch beside it. */
  runDir: string;
  /** Write `content` to `rel` under `cwd`, making folders. */
  write(rel: string, content: string): void;
  /** Run git in `cwd`. */
  git(...args: string[]): void;
  /** `git init` with an identity and one empty commit, so the agent sees a repository. */
  initRepo(): void;
};

/**
 * Git for a fixture, deaf to the person's own configuration: their global and system config can
 * hold hooks (a `post-checkout` that links `.agents/store` into their real notes), templates and
 * signing, none of which a fixture may run.
 */
export const FIXTURE_GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "e2e",
  GIT_AUTHOR_EMAIL: "e2e@example.invalid",
  GIT_COMMITTER_NAME: "e2e",
  GIT_COMMITTER_EMAIL: "e2e@example.invalid",
};

/**
 * Folders in the run's own folder for the tools a session the drivers start may write with, so a
 * fixture never makes one in the person's home: `agent-notes` keeps its store and scratch there (a
 * hook or a mod runs `agent-notes root --ensure`), and `wt` its worktrees.
 */
export const runEnv = (runDir: string) => ({
  AGENT_NOTES_DATA: join(runDir, "agent-notes", "data"),
  AGENT_NOTES_STATE: join(runDir, "agent-notes", "state"),
  WT_WORKTREE_ROOT: join(runDir, "worktrees"),
  // hunspell's personal word list: the person's own would accept words a scenario expects flagged.
  WORDLIST: join(runDir, "hunspell", "personal.dic"),
});

/** The `SetupContext` of a run: its folder for the agent and the scratch beside it. */
export function setupContext(runDir: string, cwd: string): SetupContext {
  const env = { ...process.env, ...FIXTURE_GIT_ENV, ...runEnv(runDir) };
  const git = (...args: string[]) =>
    void execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
      cwd,
      env,
      stdio: "ignore",
    });
  return {
    cwd,
    runDir,
    write(rel, content) {
      const file = join(cwd, rel);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    },
    git,
    initRepo() {
      git("init", "-q", "-b", "main");
      git(
        "-c",
        "user.name=e2e",
        "-c",
        "user.email=e2e@example.invalid",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "init",
      );
    },
  };
}
