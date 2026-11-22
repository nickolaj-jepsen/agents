/**
 * Leaving a watched foreground session is one drain: no work starts after it, and whatever the exit
 * raced is ended rather than left for a late replay to take. The session, a confirmed replacement
 * and one still starting are scripted here; the run folders are real ones.
 *
 * An aborted spawn is the other half: `spawn({signal})` errors before the child is gone, so its
 * folder must wait for `close` and not merely for the abort.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { drainForeground, waitForChildClose, type Owned } from "./foreground.ts";

const dir = mkdtempSync(join(tmpdir(), "drive-foreground-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const folder = (name: string) => {
  const path = mkdtempSync(join(dir, `${name}-`));
  return path;
};

/** A session whose whole observable behavior is "was it closed, and is its folder gone". */
function owned(name: string) {
  const runDir = folder(name);
  const seen = { closed: false, abortedBeforeClose: false };
  return {
    seen,
    session: {
      runDir,
      close: async () => {
        seen.closed = true;
      },
    } satisfies Owned,
  };
}

describe("draining a foreground session", () => {
  it("ends the screen, a confirmed replacement and one still starting", async () => {
    const origin = folder("origin");
    let stubStopped = 0;
    const shown = owned("shown");
    const confirmed = owned("confirmed");
    const starting = owned("starting");
    const order: string[] = [];

    await drainForeground({
      abort: () => order.push("abort"),
      stopWatching: async () => {
        order.push("watch");
      },
      session: shown.session,
      staged: confirmed.session,
      starting: Promise.resolve(starting.session),
      origin: { runDir: origin, stopStub: () => stubStopped++ },
    });

    // Abort comes before any wait: a replay that reached its post-wait check sees it.
    expect(order).toEqual(["abort", "watch"]);
    // Nothing the exit raced keeps a terminal or a run folder.
    for (const s of [shown, confirmed, starting]) {
      expect(s.seen.closed).toBe(true);
      expect(existsSync(s.session.runDir)).toBe(false);
    }
    // A shown session ends its own stub; the run's original folder goes either way.
    expect(stubStopped).toBe(0);
    expect(existsSync(origin)).toBe(false);
  });

  it("stops the stand-in stub of the original folder when no session is left", async () => {
    const origin = folder("origin-stub");
    let stubStopped = 0;
    await drainForeground({
      abort: () => {},
      stopWatching: async () => {},
      origin: { runDir: origin, stopStub: () => stubStopped++ },
    });
    expect(stubStopped).toBe(1);
    expect(existsSync(origin)).toBe(false);
  });

  it("does not close a failed replacement twice, and still drains the screen", async () => {
    const origin = folder("origin-failed");
    const shown = owned("shown-failed");
    await drainForeground({
      abort: () => {},
      stopWatching: async () => {},
      session: shown.session,
      staged: new Error("reload failed"),
      origin: { runDir: origin, stopStub: () => undefined },
    });
    expect(shown.seen.closed).toBe(true);
    expect(existsSync(origin)).toBe(false);
  });
});

describe("waiting for an aborted child", () => {
  it("resolves only once the child has closed, not when the spawn reports the abort", async () => {
    const controller = new AbortController();
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 400)"], {
      stdio: "ignore",
      signal: controller.signal,
    });
    const events: string[] = [];
    child.once("error", () => events.push("error"));
    child.once("exit", () => events.push("exit"));
    child.once("close", () => events.push("close"));

    const waited = waitForChildClose(child, controller.signal);
    controller.abort();
    const code = await waited;

    // The abort is not the child being gone: the drain awaited `close`.
    expect(events.at(-1)).toBe("close");
    expect(events.slice(0, -1)).not.toContain("close");
    // A signalled child is not a failed spawn.
    expect(code === null || typeof code === "number").toBe(true);
  });

  it("rejects a spawn that never started, without waiting for a close that never comes", async () => {
    const controller = new AbortController();
    const child = spawn("drive-foreground-no-such-program", [], {
      stdio: "ignore",
      signal: controller.signal,
    });
    await expect(waitForChildClose(child, controller.signal)).rejects.toThrow();
  });
});
