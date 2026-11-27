/**
 * Git branch, status and pull request for the footer, refreshed off the render path:
 * `git status --porcelain=v2` runs asynchronously, so rendering never waits on a subprocess, and it
 * is asked again on a timer as well as after pi's own events because other sessions share the
 * checkout. The branch's pull request is a linked glyph, looked up with `gh` only when something
 * could have changed it: the session starting, the branch moving, a first push, or a command that
 * pushes or edits a pull request.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { branchPart, parseStatus, type GitState, type PrKind, type PrRef } from "../lib/git.ts";
import type { BranchMode, Part } from "../lib/footer.ts";
import type { ChromeState } from "./state.ts";

const PR_TIMEOUT_MS = 5000;
// Commands that can change which pull request a branch carries, or its state.
export const PR_COMMAND = /\bgit\s+push\b|\bgh\s+pr\s+(create|merge|close|reopen|edit|ready)\b/;
// Pi emits events only for its own work, so a peer session, a subagent in this checkout or an
// external formatter changes the tree silently. `git status` costs milliseconds on a normal repo,
// and the busy guard keeps a slow one from stacking.
const POLL_MS = 2000;

const readTrim = (path: string) => {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
};

const readStep = (numFile: string, endFile: string) => {
  const num = readTrim(numFile);
  const end = readTrim(endFile);
  return num && end ? `${num}/${end}` : undefined;
};

/** The operation the repository is in the middle of, from the files git leaves under its dir. */
const detectOperation = (gitDir: string): string | undefined => {
  const rebaseMerge = join(gitDir, "rebase-merge");
  if (existsSync(rebaseMerge)) {
    const step = readStep(join(rebaseMerge, "msgnum"), join(rebaseMerge, "end"));
    return step ? `rebase ${step}` : "rebase";
  }
  const rebaseApply = join(gitDir, "rebase-apply");
  if (existsSync(rebaseApply)) {
    const op = existsSync(join(rebaseApply, "applying")) ? "am" : "rebase";
    const step = readStep(join(rebaseApply, "next"), join(rebaseApply, "last"));
    return step ? `${op} ${step}` : op;
  }
  if (existsSync(join(gitDir, "MERGE_HEAD"))) return "merge";
  if (existsSync(join(gitDir, "CHERRY_PICK_HEAD"))) return "cherry-pick";
  if (existsSync(join(gitDir, "REVERT_HEAD"))) return "revert";
  const next = readTrim(join(gitDir, "sequencer", "todo"))
    .split("\n")
    .find((line) => {
      const trimmed = line.trim();
      return trimmed !== "" && !trimmed.startsWith("#");
    });
  if (next?.startsWith("pick ") || next?.startsWith("p ")) return "cherry-pick";
  if (next?.startsWith("revert ")) return "revert";
  return undefined;
};

/** Git branch, status and pull request for the footer, refreshed off the render path. */
export const createGit = (chrome: ChromeState) => {
  let gitState: GitState | null | undefined;
  // Only a repository is cached: a plain directory can become one with `git init`.
  let gitDir: string | undefined;
  let gitBusy = false;
  let gitQueued = false;
  let gitTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let polling = false;
  let activeCwd = "";

  let currentPr: PrRef | null = null;
  // Bumped per lookup, so only the latest one's answer is painted.
  let prLookup = 0;
  let prDirty = false;
  let ghMissing = false;

  const runGit = (cwd: string, args: string[]) =>
    new Promise<string | null>((resolve) => {
      execFile(
        "git",
        ["--no-optional-locks", "-C", cwd, ...args],
        // Porcelain lists every changed path; a big dirty tree outgrows 1 MiB.
        { timeout: 3000, maxBuffer: 32 << 20 },
        (error, stdout) => resolve(error ? null : stdout),
      );
    });

  /** The branch's pull request, `null` for none, `undefined` when gh could not say. */
  const fetchPr = (cwd: string) =>
    new Promise<PrRef | null | undefined>((resolve) => {
      execFile(
        "gh",
        ["pr", "view", "--json", "url,number,state,isDraft"],
        { cwd, timeout: PR_TIMEOUT_MS, maxBuffer: 1 << 16 },
        (error, stdout, stderr) => {
          if (error) {
            // Without gh there is nothing to learn from retrying this session.
            if (error.code === "ENOENT") ghMissing = true;
            // These two are answers; anything else (offline, auth, timeout) is not.
            const none = /no pull requests found|no git remotes found/.test(stderr);
            resolve(none ? null : undefined);
            return;
          }
          try {
            const data = JSON.parse(stdout) as {
              url: string;
              number: number;
              state: string;
              isDraft?: boolean;
            };
            const state: PrKind = data.isDraft
              ? "draft"
              : data.state === "MERGED"
                ? "merged"
                : data.state === "CLOSED"
                  ? "closed"
                  : "open";
            resolve({ url: data.url, number: data.number, state });
          } catch {
            resolve(undefined);
          }
        },
      );
    });

  const setPr = (pr: PrRef | null) => {
    if (currentPr?.url === pr?.url && currentPr?.state === pr?.state) return;
    currentPr = pr;
    chrome.tui?.requestRender();
  };

  /** Looks the branch's pull request up again; a failed lookup keeps the branch's last answer. */
  const refreshPr = async (state: GitState) => {
    const lookup = ++prLookup;
    // A branch that was never pushed has no pull request yet, and that is an answer.
    if (!state.branch || !state.upstream) {
      setPr(null);
      return;
    }
    if (ghMissing) return;
    const pr = await fetchPr(activeCwd);
    if (lookup !== prLookup || pr === undefined) return;
    setPr(pr);
  };

  const resolveGitDir = async (cwd: string): Promise<string | null> => {
    if (gitDir) return gitDir;
    const output = await runGit(cwd, ["rev-parse", "--path-format=absolute", "--git-dir"]);
    gitDir = output?.trim() || undefined;
    return gitDir ?? null;
  };

  /** Serialized state, so a poll that learned nothing new does not repaint the TUI. */
  const stateKey = (state: GitState | null | undefined) => (state ? JSON.stringify(state) : "");

  const refreshGit = async () => {
    if (gitBusy) {
      gitQueued = true;
      return;
    }
    gitBusy = true;
    const cwd = activeCwd;
    try {
      const dir = await resolveGitDir(cwd);
      if (!dir) {
        const changed = gitState !== null;
        gitState = null;
        prDirty = false;
        prLookup++;
        setPr(null);
        if (changed) chrome.tui?.requestRender();
        return;
      }
      const status = await runGit(cwd, ["status", "--porcelain=v2", "--branch"]);
      // Keep the last state through a slow status; probe again in case the worktree itself is gone.
      if (!status) {
        gitDir = undefined;
        return;
      }
      const previous = gitState;
      const next = parseStatus(status, detectOperation(dir));
      const changed = stateKey(previous) !== stateKey(next);
      gitState = next;
      const lookup =
        prDirty ||
        previous == null ||
        previous.branch !== next.branch ||
        previous.upstream !== next.upstream;
      prDirty = false;
      // The last answer belongs to the old branch, so it must not outlive it.
      if (previous?.branch !== next.branch) setPr(null);
      if (lookup) void refreshPr(next);
      if (changed) chrome.tui?.requestRender();
    } finally {
      gitBusy = false;
      if (gitQueued) {
        gitQueued = false;
        scheduleGit(50);
      }
    }
  };

  const scheduleGit = (delay = 400) => {
    if (gitTimer) clearTimeout(gitTimer);
    gitTimer = setTimeout(() => {
      gitTimer = undefined;
      void refreshGit().catch(() => {});
    }, delay);
    gitTimer.unref?.();
  };

  // One poll at a time: the next one is armed when the previous refresh settles, so a slow status
  // cannot queue up behind itself.
  const armPoll = () => {
    if (!polling || pollTimer) return;
    pollTimer = setTimeout(() => {
      pollTimer = undefined;
      void refreshGit()
        .catch(() => {})
        .finally(armPoll);
    }, POLL_MS);
    pollTimer.unref?.();
  };

  return {
    view: (mode: BranchMode): Part | null =>
      branchPart(gitState, currentPr, mode, basename(activeCwd)),
    schedule: scheduleGit,
    /** Keep asking while the footer is on screen; stops on `dispose`. */
    startPolling: () => {
      polling = true;
      armPoll();
    },
    /** Looks the pull request up again with the next status, which sees the command's effect. */
    markPrDirty: () => {
      prDirty = true;
    },
    /** Points this at the session's cwd, which never changes, and asks git once. */
    start: (cwd: string) => {
      activeCwd = cwd;
      scheduleGit(0);
    },
    dispose: () => {
      polling = false;
      if (gitTimer) clearTimeout(gitTimer);
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = undefined;
    },
  };
};

export type Git = ReturnType<typeof createGit>;
