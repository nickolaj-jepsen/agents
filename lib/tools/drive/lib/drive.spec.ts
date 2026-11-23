/**
 * Watching is the foreground workflow's: `live` replays on a save, and a parked session changes only
 * when an agent asks it to. The commands themselves are the seam: what `drive` offers and what it
 * refuses says which workflow a person or an agent has.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "drive-verbs-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A `drive` invocation in a checkout-scoped session registry of its own. */
const drive = (...args: string[]) =>
  spawnSync(process.execPath, [join(import.meta.dirname, "..", "drive.ts"), ...args], {
    encoding: "utf8",
    env: { ...process.env, XDG_STATE_HOME: dir },
  });

/** The sessions this checkout's registry holds; none at all when it was never written. */
const parked = () => {
  const sessions = join(dir, "agent-tools-e2e", "sessions");
  return existsSync(sessions) ? readdirSync(sessions) : [];
};

describe("watching a scenario", () => {
  it("is offered on live, and not on goto", () => {
    const live = drive("live", "--help");
    expect(live.status).toBe(0);
    expect(live.stdout).toMatch(/--watch/);
    expect(live.stdout).toMatch(/--in-place/);

    const goto = drive("goto", "--help");
    expect(goto.status).toBe(0);
    expect(goto.stdout).not.toMatch(/--watch/);
    expect(goto.stdout).not.toMatch(/--in-place/);
    // What a person can no longer watch here, the parked session does on request.
    expect(goto.stdout).toMatch(/reload/);
  });

  it("refuses --watch on goto and parks nothing", () => {
    for (const flag of ["--watch", "--in-place"]) {
      const r = drive("goto", "answer", "cards-open", "--harness", "pi", flag);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(new RegExp(`unknown option '${flag}'`));
    }
    expect(parked()).toEqual([]);
  });

  it("leaves reload as the way a parked session changes", () => {
    const reload = drive("reload", "--help");
    expect(reload.status).toBe(0);
    expect(reload.stdout).toMatch(/rebuild and play the parked session's scenario/);
  });
});

it("rejects an invalid terminal session name in either flag position", () => {
  for (const args of [
    ["--session", "../outside", "terminal", "text"],
    ["terminal", "--session", "../outside", "text"],
    ["terminal", "--session=../outside", "text"],
  ]) {
    const result = drive(...args);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--session "../outside": use up to 24 letters');
  }
});

describe("changing one session at a time", () => {
  /** `drive` without blocking this process's event loop, which the lock below depends on. */
  const driveAsync = (...args: string[]) =>
    new Promise<{ status: number | null; stdout: string }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [join(import.meta.dirname, "..", "drive.ts"), ...args],
        {
          env: { ...process.env, XDG_STATE_HOME: dir },
        },
      );
      let stdout = "";
      child.stdout.on("data", (chunk) => (stdout += String(chunk)));
      child.stderr.on("data", () => undefined);
      child.once("error", reject);
      child.once("exit", (status) => resolve({ status, stdout }));
    });

  it("makes a stop of the same name wait, and another name not", async () => {
    // The lock's endpoint comes from the registry when its module loads: this spec's own registry.
    process.env.XDG_STATE_HOME = dir;
    const { withSessionLock } = await import("./lock.ts");
    let signalTaken!: () => void;
    let release!: () => void;
    const taken = new Promise<void>((resolve) => (signalTaken = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    const done = withSessionLock("default", async () => {
      signalTaken();
      await released;
    });
    await taken;
    const same = driveAsync("stop");
    try {
      const other = driveAsync("stop", "--session", "b");
      const first = await Promise.race([
        other.then(({ status }) => ({ name: "b", status })),
        same.then(({ status }) => ({ name: "default", status })),
      ]);
      expect(first).toEqual({ name: "b", status: 0 });
    } finally {
      release();
      await done;
    }
    // Nothing was parked: what it waited for is the name's lock, not a session.
    expect(await same).toMatchObject({
      status: 0,
      stdout: expect.stringMatching(/nothing was running in default/),
    });
  }, 30_000);
});
