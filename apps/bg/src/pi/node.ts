/**
 * What a background task needs from the operating system: a private folder for
 * its logs, a shell started in a process group of its own, a bounded read of a
 * log, and timers that do not hold the process open.
 */
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, fstatSync, mkdtempSync, openSync, readSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Exit, Process } from "../lib/tasks.ts";
import type { LogRead } from "../lib/tail.ts";

/** A session id as a folder name: readable, and nothing a path has to escape. */
const slug = (sessionId: string): string =>
  sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40) || "session";

/**
 * This instance's log folder, made on first use: `mkdtemp` gives a fresh
 * private (0700) folder, so two sessions never read each other's logs and a
 * reloaded one cannot reopen a file its transcript still points at. The folder
 * and the logs outlive the session, which is what makes them readable after it.
 */
export const logPaths = (sessionId: string): ((id: number) => string) => {
  let dir: string | undefined;
  return (id) => {
    dir ??= mkdtempSync(join(tmpdir(), `pi-bg-${slug(sessionId)}-`));
    return join(dir, `${id}.log`);
  };
};

export const instanceId = (): string => randomUUID();

/**
 * Starts `bash -c` detached in `cwd`, its output going to `logPath`. Detached,
 * so the task leads its own process group and one kill takes its children with
 * it. The child stays referenced, so a task still running holds pi open until
 * it ends — which is also what lets a stop's unref'd kill timer fire — and a
 * shutdown's SIGTERM is what lets pi exit.
 */
export const spawnDetached = (
  command: string,
  options: { cwd: string; logPath: string },
): Promise<Process> =>
  new Promise<Process>((resolve, reject) => {
    let fd: number;
    try {
      fd = openSync(options.logPath, "wx", 0o600);
    } catch (error) {
      reject(error);
      return;
    }
    let child: ChildProcess;
    try {
      // bash from PATH: the shell pi itself would pick is Apple's 3.2 on darwin.
      child = spawn("bash", ["-c", command], {
        cwd: options.cwd,
        detached: true,
        stdio: ["ignore", fd, fd],
      });
    } catch (error) {
      reject(error);
      return;
    } finally {
      // The child has its own copy of the descriptor.
      try {
        closeSync(fd);
      } catch {}
    }
    // An error after it started is its exit's business, and an unhandled one would throw.
    child.on("error", () => {});
    child.once("error", (error) => reject(error));

    const exited = new Promise<Exit>((done) => {
      child.once("exit", (code, signal) => done({ code, signal }));
    });

    child.once("spawn", () => {
      const pid = child.pid;
      if (pid === undefined) {
        reject(new Error("bash started without a pid"));
        return;
      }
      resolve({
        pid,
        exited,
        kill: (signal) => {
          try {
            // The negative pid is the group: the shell and everything it started.
            process.kill(-pid, signal);
          } catch {
            // Already gone, group and all: nothing to signal.
          }
        },
      });
    });
  });

/** At most `maxBytes` from the end of a log, and whether the front was cut off. */
export const readLogTail = (path: string, maxBytes: number): LogRead => {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(size - start);
    readSync(fd, buffer, 0, buffer.length, start);
    return { bytes: new Uint8Array(buffer), cut: start > 0 };
  } finally {
    closeSync(fd);
  }
};

/** A timer that never holds pi open: a stop's kill must not outlive the session. */
export const setUnrefTimer = (run: () => void, ms: number): (() => void) => {
  const timer = setTimeout(run, ms);
  timer.unref();
  return () => clearTimeout(timer);
};
