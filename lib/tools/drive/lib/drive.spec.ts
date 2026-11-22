/**
 * Watching is the foreground workflow's: `live` replays on a save, and a parked session changes only
 * when an agent asks it to. The commands themselves are the seam: what `drive` offers and what it
 * refuses says which workflow a person or an agent has.
 */
import { spawnSync } from "node:child_process";
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
