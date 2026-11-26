/**
 * Serialise the things that write the same files: the CLI's updates and resets, and the refresh
 * helper's rewrites of one profile.
 *
 * Node has no flock binding, and a lockfile whose mere existence means "locked" goes stale when a
 * process dies. So the kernel owns these locks, as it always has: `agents-flock` is a few lines of
 * C around flock(2), built by Nix and put on the wrapper's PATH (or named by `AGENTS_FLOCK`). It
 * takes the lock, says so on stdout, and holds it until its stdin closes. A Node process that dies
 * — or is killed — closes that pipe, so the helper exits and the kernel releases the lock. Because
 * the lock is flock(2) on the file's inode, an older Python `agents` and this one exclude each
 * other rather than each thinking it is alone.
 *
 * The helper deliberately ignores terminal signals: Ctrl+C reaches the whole process group, and a
 * helper that died with it would free the lock while this process was still cleaning up. Only
 * closing the pipe releases it, and this module closes the pipe when the work is done; an
 * interrupted *wait* is cancelled the same way, and a helper still waiting when its parent dies
 * exits on the closed pipe instead of polling forever.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { delimiter, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { UpdatesError, describeError } from "./core/errors.ts";
import type { Environment } from "./core/paths.ts";
import {
  InterruptError,
  interruptRequested,
  onInterrupt,
  throwIfInterrupted,
} from "./interrupt.ts";

/** The lock is held by somebody else and the caller's wait ran out. */
export class LockBusyError extends UpdatesError {
  override name = "LockBusyError";
}

export type AcquireOptions = {
  /**
   * Seconds to wait. A negative value fails at once, which is what the CLI's
   * `AGENTS_UPDATE_LOCK_TIMEOUT` means when someone sets it below zero; `"forever"` is the
   * refresh helper's explicit wait and is never reached through that variable.
   */
  timeout: number | "forever";
  /** How often the helper retries, in seconds. */
  poll?: number;
  /** Called once, when the wait actually starts, with the lock path. */
  onWait?: (path: string) => void;
  /** The environment to find the helper in and to hand it. */
  env?: Environment;
};

/** The helper to run: `AGENTS_FLOCK`, then `agents-flock` on PATH. */
export function flockHelper(env: Environment = process.env): string {
  if (env.AGENTS_FLOCK) return env.AGENTS_FLOCK;
  for (const directory of (env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, "agents-flock");
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Not in this directory.
    }
  }
  throw new UpdatesError(
    "no agents-flock helper: run me from the wrapper Nix installs, or set AGENTS_FLOCK",
  );
}

/** A release function: end the helper's stdin and wait for the kernel to take the lock back. */
export type Release = () => Promise<void>;

/** The helper's argument for a wait; `-1` is its "no deadline". */
export function timeoutArgument(timeout: number | "forever"): string {
  if (timeout === "forever") return "-1";
  if (timeout === Infinity) return "Infinity";
  if (!Number.isFinite(timeout)) return "0";
  // Python's deadline was `now + timeout`, so a negative one has already passed: fail at once.
  return String(Math.max(0, timeout));
}

/**
 * Take an exclusive flock(2) on `path`, waiting at most `timeout` seconds.
 *
 * The helper reports "waiting" before "locked", so the CLI can say the wait started exactly when it
 * did; exit code 75 is its "the wait ran out", 76 its "the caller closed the pipe while waiting".
 */
export async function acquireFileLock(path: string, options: AcquireOptions): Promise<Release> {
  // An interrupted command is unwinding: do not spawn a waiter it would have to cancel.
  throwIfInterrupted();
  const helper = flockHelper(options.env);
  const poll = options.poll ?? 0.1;
  const child = spawn(helper, [path, timeoutArgument(options.timeout), String(poll)], {
    stdio: ["pipe", "pipe", "pipe"],
    env: options.env === undefined ? process.env : { ...process.env, ...stringEnv(options.env) },
  });
  child.stdin.on("error", () => undefined);
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const closed = new Promise<number | null>((resolve) => child.once("close", resolve));
  const spawnFailure = new Promise<never>((_resolve, reject) => {
    child.once("error", (error) =>
      reject(
        new UpdatesError(
          `cannot run the lock helper ${helper}: ${describeError(error)}; set AGENTS_FLOCK to it`,
        ),
      ),
    );
  });
  spawnFailure.catch(() => undefined);

  let locked = false;
  // Cancel a *pending* wait by closing the pipe: the helper notices while it polls and exits. Once
  // the lock is ours this listener is gone, so a signal can never free it behind the cleanup's back.
  const cancelWait = onInterrupt(() => {
    if (!locked && !child.stdin.destroyed) child.stdin.end();
  });

  child.stdout.setEncoding("utf8");
  try {
    await new Promise<void>((resolve, reject) => {
      let buffer = "";
      child.stdout.on("data", (chunk: string) => {
        buffer += chunk;
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (line === "waiting") options.onWait?.(path);
          if (line === "locked") {
            locked = true;
            resolve();
          }
          newline = buffer.indexOf("\n");
        }
      });
      void closed.then((code) => {
        if (locked) return;
        if (interruptRequested()) {
          reject(new InterruptError("interrupted"));
        } else if (code === 75) {
          reject(new LockBusyError(`another agents update holds ${path}`));
        } else if (code === 76) {
          reject(new UpdatesError(`the lock helper for ${path} exited before it held the lock`));
        } else {
          reject(
            new UpdatesError(
              `the lock helper exited (${code ?? "signal"})${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
            ),
          );
        }
      });
      void spawnFailure.catch(reject);
    });
  } finally {
    cancelWait();
  }

  return async () => {
    if (!child.stdin.destroyed) child.stdin.end();
    await closed;
  };
}

/** Run `fn` holding `path`'s lock, releasing it however `fn` ends — including an interrupt. */
export async function withFileLock<T>(
  path: string,
  options: AcquireOptions,
  fn: () => Promise<T> | T,
): Promise<T> {
  const release = await acquireFileLock(path, options);
  try {
    // A Ctrl+C that arrived while the lock was being taken still unwinds before any work.
    throwIfInterrupted();
    return await fn();
  } finally {
    await release();
  }
}

function stringEnv(env: Environment): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env))
    if (typeof value === "string") result[key] = value;
  return result;
}

/** Poll interval shared with the helper's own default; exported so a spec can shorten a wait. */
export const LOCK_POLL_SECONDS = 0.1;

/** Sleep a poll interval: the CLI never sleeps itself, but a spec may wait on a holder. */
export const lockPoll = (): Promise<void> => sleep(LOCK_POLL_SECONDS * 1000);
