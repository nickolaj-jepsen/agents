/**
 * One drive command changes a parked session at a time. The kernel owns each name's lock: an
 * abstract socket on Linux, an advisory file lock on other Unix hosts. Process death releases
 * the lock; it does not guarantee that any child resources also went away.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { sessionFile } from "./sessions.ts";

export type LockBackend = "abstract" | "file";

type LockOptions = { timeout?: number; poll?: number; backend?: LockBackend };

const busy = (name: string, timeout: number) =>
  new Error(
    `session ${name} is being changed by another drive command; gave up after ${timeout / 1000}s`,
  );

function listen(path: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => socket.destroy());
    server.once("error", reject);
    server.listen(path, () => {
      server.removeListener("error", reject);
      server.on("error", () => undefined);
      resolve(server);
    });
  });
}

async function acquireSocket(name: string, timeout: number, poll: number) {
  const key = createHash("sha256").update(sessionFile(name)).digest("hex").slice(0, 16);
  const until = Date.now() + timeout;
  for (;;) {
    try {
      const server = await listen(`\0drive-${key}`);
      return () => new Promise<void>((resolve) => server.close(() => resolve()));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err;
      if (Date.now() >= until) throw busy(name, timeout);
      await sleep(poll);
    }
  }
}

// Node has no flock binding. The dev shell's Python keeps the descriptor open until drive closes
// the pipe (also on death). Never unlink the file: a contender may already be waiting on that inode.
const flock = `
import fcntl, select, sys, time
path, timeout, poll = sys.argv[1:]
end = time.monotonic() + float(timeout)
with open(path, "a") as lock:
    while True:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except BlockingIOError:
            left = end - time.monotonic()
            if left <= 0:
                sys.exit(75)
            if select.select([sys.stdin], [], [], min(left, float(poll)))[0]:
                sys.exit(0)
    print("locked", flush=True)
    sys.stdin.read()
`;

async function acquireFile(name: string, timeout: number, poll: number) {
  const path = `${sessionFile(name)}.lock`;
  mkdirSync(dirname(path), { recursive: true });
  const child = spawn("python3", ["-c", flock, path, String(timeout / 1000), String(poll / 1000)], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  child.stdin.on("error", () => undefined);
  const closed = new Promise<number | null>((resolve) => child.once("close", resolve));
  await new Promise<void>((resolve, reject) => {
    child.stdout.once("data", () => resolve());
    child.once("error", reject);
    void closed.then((code) => {
      reject(code === 75 ? busy(name, timeout) : new Error(`file lock helper exited (${code})`));
    });
  });
  return async () => {
    child.stdin.end();
    await closed;
  };
}

/** Runs `fn` holding this checkout's lock for `name`, even while other commands wait on it. */
export async function withSessionLock<T>(
  name: string,
  fn: () => Promise<T>,
  o: LockOptions = {},
): Promise<T> {
  const backend = o.backend ?? (process.platform === "linux" ? "abstract" : "file");
  const acquire = backend === "abstract" ? acquireSocket : acquireFile;
  const release = await acquire(name, o.timeout ?? 300_000, o.poll ?? 50);
  try {
    return await fn();
  } finally {
    await release();
  }
}
