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

/** The `SetupContext` of a run: its folder for the agent and the scratch beside it. */
export function setupContext(runDir: string, cwd: string): SetupContext {
  const git = (...args: string[]) => void execFileSync("git", args, { cwd, stdio: "ignore" });
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
