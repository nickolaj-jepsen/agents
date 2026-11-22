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
    /** Holds `name`'s lock for `ms`, and leaves when it let go (`0` until then). */
    const holdFor = (name: string, ms: number) => {
      const held = { released: 0 };
      const done = withSessionLock(name, async () => {
        await new Promise((r) => setTimeout(r, ms));
        held.released = Date.now();
      });
      return { held, done };
    };

    // Another name is another lock: `b` is stopped while `default` is held.
    const { held, done } = holdFor("default", 2500);
    await new Promise((r) => setTimeout(r, 100));
    const other = await driveAsync("stop", "--session", "b");
    expect(other.status).toBe(0);
    expect(held.released).toBe(0);

    // A stop of `default` cannot exit before the lock is let go.
    const same = await driveAsync("stop");
    expect(same.status).toBe(0);
    expect(held.released).not.toBe(0);
    // Nothing was parked: what it waited for is the name's lock, not a session.
    expect(same.stdout).toMatch(/nothing was running in default/);
    await done;
  }, 30_000);
});
