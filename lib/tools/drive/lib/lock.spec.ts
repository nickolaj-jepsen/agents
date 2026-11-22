/**
 * One command changes a parked session at a time, and a command that dies holding the lock leaves
 * it free: the lock is a socket the kernel keeps for the process's life, not a file it must tidy.
 * Different session names are different sockets, so they never wait for one another.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as Lock from "./lock.ts";

const dir = mkdtempSync(join(tmpdir(), "drive-lock-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** This spec's own registry and runtime folder, which the lock's endpoint is derived from. */
const env = () => ({ ...process.env, XDG_STATE_HOME: join(dir, "state"), XDG_RUNTIME_DIR: dir });

let lock: typeof Lock;
beforeAll(async () => {
  Object.assign(process.env, env());
  lock = await import("./lock.ts");
});

/** A process that holds session `name` for `ms` and says so in `log` one line per edge. */
const holder = join(dir, "holder.ts");
writeFileSync(
  holder,
  `import { withSessionLock } from ${JSON.stringify(join(import.meta.dirname, "lock.ts"))};
import { appendFileSync } from "node:fs";
const [name, log, ms, backend] = process.argv.slice(2);
await withSessionLock(
  name!,
  async () => {
    appendFileSync(log!, "start\\n");
    await new Promise((r) => setTimeout(r, Number(ms)));
    appendFileSync(log!, "end\\n");
  },
  backend ? { backend: backend as "abstract" | "file" } : {},
);
`,
);

/** Runs the holder and returns the promise of its exit. */
const hold = (name: string, log: string, ms: number, backend?: Lock.LockBackend) => {
  const child = spawn(process.execPath, [holder, name, log, String(ms), backend ?? ""], {
    env: env(),
    stdio: "inherit",
  });
  return { child, exited: new Promise<number>((r) => child.once("exit", (code) => r(code ?? 1))) };
};

const lines = (log: string) =>
  readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .filter((l) => l.length > 0);

/** Waits for the holder to say it has the lock (`start`), so a kill lands while it holds it. */
async function started(log: string, timeout = 20_000) {
  const until = Date.now() + timeout;
  for (;;) {
    try {
      if (lines(log).includes("start")) return;
    } catch {
      /* not written yet */
    }
    if (Date.now() > until) throw new Error(`the holder never started; log: ${log}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("a session name", () => {
  it("serializes the processes changing it", async () => {
    const log = join(dir, "same.log");
    const startedAt = Date.now();
    const children = [0, 1, 2].map(() => hold("default", log, 300));
    expect(await Promise.all(children.map((c) => c.exited))).toEqual([0, 0, 0]);
    // Each one starts only after the one before it ended.
    expect(lines(log)).toEqual(["start", "end", "start", "end", "start", "end"]);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(850);
  });

  it("never makes another name wait", async () => {
    const a = join(dir, "a.log");
    const b = join(dir, "b.log");
    const startedAt = Date.now();
    const children = [hold("a", a, 400), hold("b", b, 400)];
    expect(await Promise.all(children.map((c) => c.exited))).toEqual([0, 0]);
    expect(Date.now() - startedAt).toBeLessThan(780);
    expect(lines(a)).toEqual(["start", "end"]);
    expect(lines(b)).toEqual(["start", "end"]);
  });

  it("releases the lock when its holder is killed", async () => {
    const log = join(dir, "killed.log");
    const { child, exited } = hold("default", log, 60_000);
    await started(log);
    child.kill("SIGKILL");
    await exited;

    const taken = Date.now();
    const ran = await lock.withSessionLock("default", async () => true, {
      timeout: 5000,
      poll: 25,
    });
    expect(ran).toBe(true);
    expect(Date.now() - taken).toBeLessThan(2000);
  });

  it("releases a socket file whose holder was killed", async () => {
    const log = join(dir, "file.log");
    const { child, exited } = hold("default", log, 60_000, "file");
    await started(log);
    child.kill("SIGKILL");
    await exited;

    const ran = await lock.withSessionLock("default", async () => true, {
      backend: "file",
      timeout: 5000,
      poll: 25,
    });
    expect(ran).toBe(true);
  });

  it("gives up with the name when it waits too long", async () => {
    const log = join(dir, "held.log");
    const { child, exited } = hold("default", log, 60_000);
    try {
      await started(log);
      await expect(
        lock.withSessionLock("default", async () => true, { timeout: 300, poll: 25 }),
      ).rejects.toThrow(/session default is being changed by another drive command/);
    } finally {
      child.kill("SIGKILL");
      await exited;
    }
  });
});
