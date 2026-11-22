/**
 * One drive command changes a parked session at a time: `goto`, `reload` and `stop` of a name take
 * the name's lock before they read its record, and a second command waits. Different names never
 * share a lock, so inspecting one plugin does not stop another run.
 *
 * The lock is a socket the kernel keeps for as long as the process that took it: abstract on Linux
 * (no file at all), else a socket file, where a killed holder's file is recognised as dead and
 * unlinked. Process death therefore releases the lock; it is not a promise that the command's
 * children went with it.
 */
import { createHash } from "node:crypto";
import { mkdirSync, unlinkSync } from "node:fs";
import { connect, createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sessionFile } from "./sessions.ts";

export type LockBackend = "abstract" | "file";

export type LockOptions = {
  /** How long to wait for the current holder; a long reload is still a wait, not a failure. */
  timeout?: number;
  /** How often to look again. */
  poll?: number;
  /** `file` everywhere but Linux, where an abstract socket needs no folder. */
  backend?: LockBackend;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Where a file-backed lock lives. A socket path holds about 100 bytes, which a session's registry
 * path may not fit in, so these go to `/tmp` (as run folders do) under the record's own hash.
 */
const locksDir = (): string => {
  const base = process.platform === "win32" ? tmpdir() : "/tmp";
  return join(
    base,
    `agent-tools-e2e-locks-${typeof process.getuid === "function" ? process.getuid() : "me"}`,
  );
};

/** This checkout and session, short enough for a socket path. */
const lockKey = (name: string) =>
  createHash("sha256").update(sessionFile(name)).digest("hex").slice(0, 16);

const endpoint = (name: string, backend: LockBackend) =>
  backend === "abstract" ? `\0drive-${lockKey(name)}` : join(locksDir(), `${lockKey(name)}.lock`);

const defaultBackend = (): LockBackend => (process.platform === "linux" ? "abstract" : "file");

function listen(path: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => socket.destroy());
    server.once("error", reject);
    server.listen(path, () => {
      server.removeListener("error", reject);
      // A socket of ours, for a command's duration only: never let it take the process down.
      server.on("error", () => undefined);
      resolve(server);
    });
  });
}

/** Whether anyone answers at a socket file, which a killed holder's leaves behind. */
function answered(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(path);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function acquire(
  name: string,
  backend: LockBackend,
  timeout: number,
  poll: number,
): Promise<() => Promise<void>> {
  const path = endpoint(name, backend);
  if (backend === "file") mkdirSync(locksDir(), { recursive: true });
  const until = Date.now() + timeout;
  for (;;) {
    try {
      const server = await listen(path);
      return async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        if (backend === "file")
          try {
            unlinkSync(path);
          } catch {
            /* gone already */
          }
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err;
      // The abstract socket goes with its holder; a socket file stays. Only a file no one answers
      // on is dead: unlinking a live one would give the next command a second lock.
      if (backend === "file" && !(await answered(path)))
        try {
          unlinkSync(path);
        } catch {
          /* gone already */
        }
      if (Date.now() >= until)
        throw new Error(
          `session ${name} is being changed by another drive command; gave up after ${timeout / 1000}s`,
        );
      await sleep(poll);
    }
  }
}

/** Runs `fn` holding session `name` of this checkout; the lock goes when it returns, or it dies. */
export async function withSessionLock<T>(
  name: string,
  fn: () => Promise<T>,
  o: LockOptions = {},
): Promise<T> {
  const release = await acquire(
    name,
    o.backend ?? defaultBackend(),
    o.timeout ?? 300_000,
    o.poll ?? 50,
  );
  try {
    return await fn();
  } finally {
    await release();
  }
}
