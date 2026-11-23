/**
 * A chain's verdict is the one its scenarios came to in the session they played in. A failure is
 * not made green by a second attempt alone, a snapshot mismatch leaves the shared session usable,
 * and the scenarios a broken step never touched still get their result in a fresh session.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { settleCapture, type Capture } from "./check.ts";
import { options } from "./options.ts";
import { mediaStage, poolSize, realStage, runAll, type Stage } from "./runner.ts";
import type { Resolved, Scenario, ScenarioSet } from "./scenario.ts";
import type { Session } from "./session.ts";

it("keeps the text gate fast and selects the daemon when pictures are requested", () => {
  const before = options.png;
  try {
    options.png = false;
    expect(realStage.backend).toBe("lib");
    expect(mediaStage(dir).backend).toBe("daemon");
    options.png = true;
    expect(realStage.backend).toBe("daemon");
  } finally {
    options.png = before;
  }
});

const dir = mkdtempSync(join(tmpdir(), "drive-runner-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A package with one harness, whose scenarios are its own. */
const set = (scenarios: Record<string, Scenario>): ScenarioSet => ({
  plugin: "fake",
  harness: "pi",
  scenarios,
});

/** A session that records only what the chain asks of it; `capture` supplies the screen. */
type Fake = { id: number; scenario: string; cols: number; rows: number };

/** Scripted sessions, one for each start, and the id of the chain's shared session. */
function sessions() {
  const opened: Fake[] = [];
  const reach: Stage["reach"] = async (r) => {
    const fake: Fake = {
      id: opened.length + 1,
      scenario: r.name,
      cols: r.size[0],
      rows: r.size[1],
    };
    opened.push(fake);
    return {
      id: fake.id,
      size: async () => [fake.cols, fake.rows],
      resize: async (cols: number, rows: number) => {
        fake.cols = cols;
        fake.rows = rows;
      },
      settle: async () => undefined,
      close: async () => undefined,
    } as unknown as Session;
  };
  const captureOf = (session: Session) => session as unknown as Fake;
  // The pool may start a fresh chain beside the shared one, so find the head's session by name.
  const shared = () => opened.find((s) => s.scenario === "head")!.id;
  return { opened, reach, captureOf, shared };
}

const shot = (r: Resolved, actual: string, expected?: string): Capture => ({
  size: r.size,
  actual,
  expected,
  snap: join(dir, `${r.name}.snap`),
  png: join(dir, `${r.name}.png`),
});

it("keeps a shared step failure and runs the untouched scenario fresh", async () => {
  const { opened, reach, captureOf, shared } = sessions();
  let attempts = 0;
  const failsShared = {
    run: async (session: Session) => {
      attempts++;
      if (captureOf(session).id === shared()) throw new Error("state leaked in the shared session");
    },
  };
  const shots: string[] = [];
  const stage: Stage = {
    reach,
    capture: async (session, r) => [shot(r, `${r.name} at ${captureOf(session).id}`)],
    failShot: async (_session, r) => {
      shots.push(r.name);
    },
  };
  const { outcomes } = await runAll(
    [
      set({
        head: { size: [70, 24], steps: [] },
        bad: { from: "head", size: [70, 24], steps: [failsShared] },
        after: { from: "bad", size: [70, 24], steps: [] },
      }),
    ],
    () => true,
    stage,
  );

  const bad = outcomes.get("fake/pi/bad")!;
  expect(bad.error?.message).toMatch(/state leaked in the shared session/);
  // Alone it would pass: a second attempt on a fresh session is not taken.
  expect(attempts).toBe(1);
  expect(shots).toEqual(["bad"]);

  const after = outcomes.get("fake/pi/after")!;
  expect(after.error).toBeUndefined();
  const fresh = opened.find((s) => s.scenario === "after")!;
  expect(fresh.id).not.toBe(shared());
  expect(after.captures[0]?.actual).toBe(`after at ${fresh.id}`);

  // The failed scenario leaves no second entry: one result, from the shared session.
  expect(opened.map((s) => s.scenario)).toEqual(["head", "after"]);
});

it("keeps a mismatch as evidence and carries on in the healthy session", async () => {
  const { reach, captureOf, shared } = sessions();
  const captured: Record<string, number[]> = {};
  const stage: Stage = {
    reach,
    capture: async (session, r) => {
      const id = captureOf(session).id;
      (captured[r.name] ??= []).push(id);
      const expected = "the stored screen";
      const actual = r.name === "bad" && id === shared() ? "the screen now" : expected;
      return [shot(r, actual, expected)];
    },
    failShot: async () => {
      throw new Error("a mismatch does not need a failure shot");
    },
  };
  const { outcomes } = await runAll(
    [
      set({
        head: { size: [70, 24] },
        bad: { from: "head", size: [70, 24] },
        after: { from: "bad", size: [70, 24] },
      }),
    ],
    () => true,
    stage,
  );

  const bad = outcomes.get("fake/pi/bad")!;
  expect(bad.error).toBeUndefined();
  expect(bad.captures[0]).toMatchObject({
    actual: "the screen now",
    expected: "the stored screen",
  });
  // The gate still reads this as red, and the evidence is the shared attempt's.
  expect(settleCapture(bad.captures[0]!)).toMatch(/differs from/);
  expect(captured.bad).toEqual([shared()]);

  // The chain was not broken by the mismatch: the next scenario played in the same session.
  const after = outcomes.get("fake/pi/after")!;
  expect(after.error).toBeUndefined();
  expect(captured.after).toEqual([shared()]);
});

it("sends the scenarios after a broken reset to fresh sessions", async () => {
  const { opened, reach, captureOf, shared } = sessions();
  let resets = 0;
  const resetFails = {
    run: async (session: Session) => {
      resets++;
      if (captureOf(session).id === shared()) throw new Error("the reset broke");
    },
  };
  const shots: string[] = [];
  const stage: Stage = {
    reach,
    capture: async (session, r) => [shot(r, `${r.name} at ${captureOf(session).id}`)],
    failShot: async (_session, r) => {
      shots.push(r.name);
    },
  };
  const { outcomes } = await runAll(
    [
      set({
        head: { size: [70, 24], steps: [] },
        before: { from: "head", size: [70, 24], steps: [], reset: [resetFails] },
        bad: { from: "head", size: [70, 24], steps: [] },
        after: { from: "bad", size: [70, 24], steps: [] },
      }),
    ],
    () => true,
    stage,
  );

  // `bad` never played, and the reset is not tried again alone.
  const broken = outcomes.get("fake/pi/bad")!;
  expect(broken.error?.message).toMatch(/the reset broke/);
  expect(resets).toBe(1);
  expect(shots).toEqual(["bad"]);

  // `after` was untouched by the chain: a session of its own, and its own result.
  const after = outcomes.get("fake/pi/after")!;
  expect(after.error).toBeUndefined();
  const fresh = opened.find((s) => s.scenario === "after")!;
  expect(fresh.id).not.toBe(shared());
  expect(after.captures[0]?.actual).toBe(`after at ${fresh.id}`);
});

it("hands a known failure that played to its capture, leaving the rule to the gate", async () => {
  const { opened, reach, captureOf } = sessions();
  const captured: string[] = [];
  const stage: Stage = {
    reach,
    capture: async (session, r) => {
      captured.push(`${r.name} at ${captureOf(session).id}`);
      return [shot(r, r.name)];
    },
    failShot: async () => undefined,
  };
  const { outcomes } = await runAll(
    [
      set({
        head: { size: [70, 24], steps: [] },
        known: { from: "head", size: [70, 24], steps: [], expectFail: "broken until fixed" },
      }),
    ],
    () => true,
    stage,
  );

  const known = outcomes.get("fake/pi/known")!;
  expect(known.error).toBeUndefined();
  // Media is not the gate: a known failure that played is still a screen to record.
  expect(known.captures.map((c) => c.actual)).toEqual(["known"]);
  expect(captured).toEqual([`head at ${opened[0]!.id}`, `known at ${opened[0]!.id}`]);
});

it("keeps each harness's --jobs limit while the queue takes added work", async () => {
  // A latch every session is held at, so concurrency is proved by what started, not by timings.
  let release: () => void = () => {};
  let reachBoth: () => void = () => {};
  const both = new Promise<void>((r) => (reachBoth = r));
  const held = new Promise<void>((r) => (release = r));
  const active: Record<string, number> = { claude: 0, pi: 0 };
  const most: Record<string, number> = { claude: 0, pi: 0 };
  const opened: string[] = [];
  const stage: Stage = {
    reach: async (r) => {
      const harness = r.harness;
      active[harness]!++;
      most[harness] = Math.max(most[harness]!, active[harness]!);
      opened.push(`${harness}/${r.name}`);
      if (active.claude === 2 && active.pi === 1) reachBoth();
      await held;
      active[harness]!--;
      return {
        size: async () => r.size,
        resize: async () => undefined,
        settle: async () => undefined,
        close: async () => undefined,
      } as unknown as Session;
    },
    capture: async (_session, r) => [shot(r, r.name)],
    failShot: async () => undefined,
  };
  const scenario = { size: [70, 24] as const, steps: [], fresh: true };
  const sets: ScenarioSet[] = [
    {
      plugin: "fake",
      harness: "claude",
      scenarios: { a: scenario, b: scenario, c: scenario, d: scenario },
    },
    { plugin: "fake", harness: "pi", scenarios: { e: scenario, f: scenario, g: scenario } },
  ];
  const before = options.jobs;
  options.jobs = { claude: 2, pi: 1 };
  try {
    const run = runAll(sets, () => true, stage);
    // Each pool fills to its own limit and no further: claude has 2 sessions, pi 1, though both
    // have work left to start.
    await both;
    expect(most).toEqual({ claude: 2, pi: 1 });
    expect(opened.length).toBe(3);
    release();
    const { outcomes } = await run;

    // Held sessions free their workers, so the rest of every queue still played exactly once.
    expect(outcomes.size).toBe(7);
    expect(outcomes.get("fake/claude/a")?.error).toBeUndefined();
    expect(outcomes.get("fake/pi/g")?.error).toBeUndefined();
    expect(opened.sort()).toEqual([
      "claude/a",
      "claude/b",
      "claude/c",
      "claude/d",
      "pi/e",
      "pi/f",
      "pi/g",
    ]);
    // Every scenario started once, and neither pool ever went over its limit.
    expect(most).toEqual({ claude: 2, pi: 1 });
  } finally {
    options.jobs = before;
  }
});

it("runs the gate in process and a recorder on the daemon", async () => {
  // The gate reads text alone until a snapshot differs or `--png` asks, and only then draws a
  // picture; the in-process engine is the one that draws a picture of this very screen, in this
  // process. Recording has its own screens and asks for the daemon, which leaves the parent's font
  // environment alone. The stage names its engine; the runner passes it through rather than
  // deciding for both.
  const engines: string[] = [];
  const names: string[] = [];
  const stage = (backend?: "lib" | "daemon"): Stage => ({
    backend,
    reach: async (r, engine, name) => {
      engines.push(engine);
      names.push(name);
      return {
        size: async () => r.size,
        resize: async () => undefined,
        settle: async () => undefined,
        close: async () => undefined,
      } as unknown as Session;
    },
    capture: async (_session, r) => [shot(r, r.name)],
    failShot: async () => undefined,
  });
  const scenarios = { head: { size: [70, 24] as const, steps: [], fresh: true } };
  await runAll([set(scenarios)], () => true, stage());
  await runAll([set(scenarios)], () => true, stage("daemon"));
  expect(engines).toEqual(["lib", "daemon"]);
  expect(new Set(names).size).toBe(2);
  for (const name of names) expect(name).toMatch(new RegExp(`^e2e-${process.pid}-[0-9]+$`));
});

it("tries to photograph a head capture failure before closing and keeps the original error", async () => {
  const events: string[] = [];
  const failure = new Error("region missing");
  const stage: Stage = {
    reach: async () =>
      ({
        close: async () => {
          events.push("close");
        },
      }) as unknown as Session,
    capture: async () => {
      throw failure;
    },
    failShot: async () => {
      events.push("picture");
      throw new Error("cannot draw picture");
    },
  };
  const { outcomes } = await runAll([set({ head: { steps: [] } })], () => true, stage);
  expect(events).toEqual(["picture", "close"]);
  expect(outcomes.get("fake/pi/head")?.error).toBe(failure);
});

it("sizes a pool from the flag, then DRIVE_JOBS, then the cores", () => {
  const jobs = options.jobs;
  const env = process.env.DRIVE_JOBS;
  const cpus = availableParallelism();
  const defaults = {
    claude: Math.max(1, Math.min(2, Math.floor(cpus / 4))),
    pi: Math.max(1, Math.min(4, Math.floor(cpus / 2))),
  };
  const sizes = () => [poolSize("claude"), poolSize("pi")];
  try {
    options.jobs = undefined;
    delete process.env.DRIVE_JOBS;
    expect(sizes()).toEqual([defaults.claude, defaults.pi]);

    // `DRIVE_JOBS` takes `--jobs`'s grammar, so a whole gate can be sized without flags.
    process.env.DRIVE_JOBS = "1";
    expect(sizes()).toEqual([1, 1]);
    process.env.DRIVE_JOBS = "claude=1,pi=2";
    expect(sizes()).toEqual([1, 2]);
    // A harness it leaves out keeps the default.
    process.env.DRIVE_JOBS = "pi=1";
    expect(sizes()).toEqual([defaults.claude, 1]);

    // The flag wins, and a value that cannot be read fails the run rather than sizing a crowd.
    options.jobs = 4;
    expect(sizes()).toEqual([4, 4]);
    options.jobs = undefined;
    process.env.DRIVE_JOBS = "nope=1";
    expect(() => poolSize("pi")).toThrow(/claude=N/);
  } finally {
    options.jobs = jobs;
    if (env === undefined) delete process.env.DRIVE_JOBS;
    else process.env.DRIVE_JOBS = env;
  }
});
