// The git work of the release tools (release.ts, plan.ts, publish.ts). Every function takes the
// repository root and runs `git -C <root>`; the specs drive them against temporary repositories.
// No imports beyond node, so the publish script runs it with plain node.
import { execFileSync } from "node:child_process";

/** One `git` run, its stdout trimmed of the trailing newline git adds. */
export function git(root: string, args: string[], env?: NodeJS.ProcessEnv): string {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
      ...(env ? { env } : {}),
    }).trimEnd();
  } catch (e) {
    const error = e as { stderr?: string | Buffer; message: string };
    const stderr = error.stderr ? String(error.stderr).trim() : "";
    throw new Error(stderr || error.message);
  }
}

/** The root of the work tree `cwd` is in. */
export function rootOf(cwd: string = process.cwd()): string {
  return git(cwd, ["rev-parse", "--show-toplevel"]);
}

/** `git status --porcelain` lines, untracked files included: empty when the tree is clean. */
export function status(root: string): string[] {
  return lines(git(root, ["status", "--porcelain", "--untracked-files=all"]));
}

/** The path a `git status --porcelain` line names, a rename's destination included. */
export function statusPath(line: string): string {
  const path = line.slice(3);
  const arrow = path.indexOf(" -> ");
  return arrow === -1 ? path : path.slice(arrow + 4);
}

/** Stages paths and makes one commit from them. */
export function commitPaths(root: string, message: string, paths: string[]): void {
  git(root, ["add", "--", ...paths]);
  git(root, ["commit", "-m", message]);
}

/** git's output as the non-empty lines it is. */
function lines(out: string): string[] {
  return out.split("\n").filter((line) => line !== "");
}
