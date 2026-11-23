/**
 * Replacing a parked terminal session is one transaction: the candidate starts beside the old
 * session, is sized, and is published only once it is ready. A failure anywhere before publication
 * ends the candidate and leaves the record from before it, so the session an agent had is still the
 * one `attach` reaches.
 *
 * The scenario play and the old session's daemon are scripted here; everything else — the record,
 * the sizes, the folders — is the driver's own.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as Lifecycle from "./lifecycle.ts";
import type { Session } from "./session.ts";
import type { SessionRecord } from "./sessions.ts";

const { tuiTest } = vi.hoisted(() => ({ tuiTest: vi.fn(async (_args: string[]) => "") }));
vi.mock("./term.ts", async (original) => ({
  ...(await original<typeof import("./term.ts")>()),
  tuiTest,
}));

const dir = mkdtempSync(join(tmpdir(), "drive-reload-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A registry of this spec's own: `sessions.ts` reads it when the module loads. */
let lifecycle: typeof Lifecycle;
let sessions: typeof import("./sessions.ts");
let setOptions: typeof import("./options.ts").setOptions;
beforeAll(async () => {
  process.env.XDG_STATE_HOME = dir;
  lifecycle = await import("./lifecycle.ts");
  sessions = await import("./sessions.ts");
  setOptions = (await import("./options.ts")).setOptions;
});

const oldRun = join(dir, "run-old");
const scenarioFile = join(dir, "pi.scenarios.ts");
writeFileSync(
  scenarioFile,
  `export default {
  plugin: "answer",
  harness: "pi",
  start: { bin: { pi: "/bin/true" } },
  scenarios: { "cards-open": { steps: [] } },
};
`,
);

const parked = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  harness: "pi",
  package: "answer",
  scenario: "cards-open",
  file: scenarioFile,
  runDir: oldRun,
  daemon: "d-1a2b3c4d-default",
  size: [80, 24],
  ...over,
});

/** What the old session does when the new one is published: nothing, it is a scripted daemon. */
const old = () => ({ close: async () => undefined, size: async () => ({ cols: 100, rows: 30 }) });

/** A candidate as `reach` hands one back, in a run folder of its own. */
function candidate(runDir: string, fail?: "resize" | "start") {
  const seen = { closed: false, resized: [] as [number, number][] };
  const session = {
    close: async () => {
      seen.closed = true;
    },
    resize: async (cols: number, rows: number) => {
      if (fail === "resize") throw new Error("resize failed");
      seen.resized.push([cols, rows]);
    },
    size: async () => ({ cols: 80, rows: 24 }),
    text: async () => "screen",
  } as unknown as Session;
  return {
    session,
    seen,
    start: async () => {
      if (fail === "start") throw new Error("the agent never reached its prompt");
      mkdirSync(runDir, { recursive: true });
      return session;
    },
  };
}

/** A reload with the build and the old daemon scripted; the rest is the driver's. */
const reload = (deps: Lifecycle.ReloadDeps) =>
  lifecycle.reloadSession("default", undefined, {
    rebuild: async () => [],
    attachOld: old as never,
    ...deps,
  });

it("stops only its own daemon slots, even beside an older session named with -next", async () => {
  const id = sessions.checkoutId;
  const other = parked({ daemon: `d-${id}-default-next`, runDir: join(dir, "run-other") });
  sessions.writeSession("default-next", other);
  mkdirSync(other.runDir);
  for (const active of [`d-${id}-default`, `d1-${id}-default`]) {
    tuiTest.mockClear();
    sessions.writeSession("default", parked({ daemon: active }));
    await lifecycle.stopSession("default");

    const expected = new Set([`d0-${id}-default`, `d1-${id}-default`, active]);
    expect(tuiTest.mock.calls.map(([args]) => args)).toEqual(
      [...expected].flatMap((daemon) => [
        ["--session", daemon, "close"],
        ["daemon", "stop", "--session", daemon],
      ]),
    );
    expect(sessions.readSession("default-next")).toEqual(other);
    expect(existsSync(other.runDir)).toBe(true);
  }
});

describe("replacing a terminal session", () => {
  it("publishes a ready candidate at the size the old session had", async () => {
    const rec = parked();
    sessions.writeSession("default", rec);
    mkdirSync(oldRun, { recursive: true });
    const runDir = join(dir, "run-next");
    const { session, seen, start } = candidate(runDir);

    await reload({ runDir: () => runDir, start: start as never });

    // The candidate took the old screen's size before it stood in for it.
    expect(seen.resized).toEqual([[100, 30]]);
    expect(seen.closed).toBe(false);
    const now = sessions.readSession("default")!;
    expect(now.runDir).toBe(runDir);
    expect(now.daemon).toBe(`d0-${sessions.checkoutId}-default`);
    // The session it replaced is gone, with its folder.
    expect(existsSync(oldRun)).toBe(false);
    void session;

    const nextRun = join(dir, "run-next-again");
    await reload({ runDir: () => nextRun, start: candidate(nextRun).start as never });
    expect(sessions.readSession("default")?.daemon).toBe(`d1-${sessions.checkoutId}-default`);
  });

  it("leaves the old session when the candidate does not start", async () => {
    const rec = parked();
    sessions.writeSession("default", rec);
    mkdirSync(oldRun, { recursive: true });
    const runDir = join(dir, "run-failed-start");
    const { start } = candidate(runDir, "start");

    await expect(reload({ runDir: () => runDir, start: start as never })).rejects.toThrow(
      /never reached its prompt/,
    );

    expect(sessions.readSession("default")).toEqual(rec);
    // …it is attachable, and the candidate's folder was not left behind.
    expect(existsSync(oldRun)).toBe(true);
    expect(existsSync(runDir)).toBe(false);
  });

  it("ends the candidate and leaves the old session when it cannot be sized", async () => {
    const rec = parked();
    sessions.writeSession("default", rec);
    mkdirSync(oldRun, { recursive: true });
    const runDir = join(dir, "run-failed-resize");
    const { seen, start } = candidate(runDir, "resize");

    await expect(reload({ runDir: () => runDir, start: start as never })).rejects.toThrow(
      /resize failed/,
    );

    expect(sessions.readSession("default")).toEqual(rec);
    expect(seen.closed).toBe(true);
    expect(existsSync(runDir)).toBe(false);
    expect(existsSync(oldRun)).toBe(true);
  });

  it("keeps a failed candidate's folder when asked to", async () => {
    setOptions({ keep: true });
    try {
      const rec = parked();
      sessions.writeSession("default", rec);
      mkdirSync(oldRun, { recursive: true });
      const runDir = join(dir, "run-kept");
      const { start } = candidate(runDir, "resize");

      await expect(reload({ runDir: () => runDir, start: start as never })).rejects.toThrow(
        /resize failed/,
      );
      expect(existsSync(runDir)).toBe(true);
      expect(sessions.readSession("default")).toEqual(rec);
    } finally {
      setOptions({ keep: false });
    }
  });
});
