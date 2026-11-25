import { describe, expect, test } from "vitest";

import {
  isLive,
  monitorStateOf,
  parseSnapshot,
  parseTask,
  statusOf,
  type BgTask,
  type BgSnapshot,
} from "./state.ts";

/** bg's own shape, as apps/bg documents it. */
const task = (over: Partial<Record<keyof BgTask, unknown>> = {}) => ({
  id: 1,
  name: "build",
  pid: 4242,
  path: "/tmp/pi-bg/s1/1.log",
  cwd: "/home/me/project",
  command: "pnpm build",
  state: "running",
  code: null,
  signal: null,
  startedAt: 1_700_000_000_000,
  finishedAt: null,
  ...over,
});

const snapshot = (over: Record<string, unknown> = {}) => ({
  protocol: 1,
  sessionId: "session-1",
  instanceId: "instance-1",
  sequence: 1,
  type: "snapshot",
  tasks: [task()],
  ...over,
});

describe("parseTask", () => {
  test("keeps the fields bg promises", () => {
    expect(parseTask(task())).toEqual({
      id: 1,
      name: "build",
      pid: 4242,
      path: "/tmp/pi-bg/s1/1.log",
      cwd: "/home/me/project",
      command: "pnpm build",
      state: "running",
      code: null,
      signal: null,
      startedAt: 1_700_000_000_000,
      finishedAt: null,
    });
  });

  test("needs a positive whole id, a known lifecycle and a start time", () => {
    expect(parseTask(task({ id: 0 }))).toBeUndefined();
    expect(parseTask(task({ id: -3 }))).toBeUndefined();
    expect(parseTask(task({ id: 1.5 }))).toBeUndefined();
    expect(parseTask(task({ id: "1" }))).toBeUndefined();
    expect(parseTask(task({ state: "zombie" }))).toBeUndefined();
    expect(parseTask(task({ state: undefined }))).toBeUndefined();
    expect(parseTask(task({ startedAt: 0 }))).toBeUndefined();
    expect(parseTask(null)).toBeUndefined();
    expect(parseTask([])).toBeUndefined();
    expect(parseTask("task")).toBeUndefined();
    // Prototype members are not lifecycles.
    expect(parseTask(task({ state: "constructor" }))).toBeUndefined();
  });

  test("bounds every text field so a label or a screen cannot be flooded", () => {
    const parsed = parseTask(
      task({
        name: "n".repeat(5_000),
        command: "c".repeat(9_000),
        cwd: "/".repeat(3_000),
        path: "p".repeat(3_000),
        signal: "S".repeat(200),
      }),
    );
    expect(parsed?.name).toHaveLength(200);
    expect(parsed?.command).toHaveLength(2_000);
    expect(parsed?.cwd).toHaveLength(400);
    expect(parsed?.path).toHaveLength(400);
    expect(parsed?.signal).toHaveLength(32);
  });

  test("turns an unusable pid into none, and keeps a real group leader", () => {
    expect(parseTask(task({ pid: 0 }))?.pid).toBeNull();
    expect(parseTask(task({ pid: -1 }))?.pid).toBeNull();
    expect(parseTask(task({ pid: null }))?.pid).toBeNull();
    expect(parseTask(task({ pid: 99 }))?.pid).toBe(99);
    expect(parseTask(task({ code: 2 }))?.code).toBe(2);
    expect(parseTask(task({ finishedAt: 1_700_000_000_500 }))?.finishedAt).toBe(1_700_000_000_500);
  });
});

describe("parseSnapshot", () => {
  test("accepts protocol 1 and keeps the session, instance and sequence", () => {
    const parsed = parseSnapshot(snapshot());
    expect(parsed).toMatchObject({
      protocol: 1,
      sessionId: "session-1",
      instanceId: "instance-1",
      sequence: 1,
      type: "snapshot",
    });
    expect(parsed?.tasks).toHaveLength(1);
  });

  test("refuses a message type it does not know", () => {
    // A type added later may mean something else; drawing it as a list would
    // keep stale tasks on screen instead of waiting for a message we understand.
    expect(parseSnapshot(snapshot({ type: undefined }))).toBeUndefined();
    expect(parseSnapshot(snapshot({ type: "delta" }))).toBeUndefined();
    expect(parseSnapshot(snapshot({ type: "Stopped" }))).toBeUndefined();
  });

  test("refuses another protocol or a snapshot with no session", () => {
    expect(parseSnapshot(snapshot({ protocol: 2 }))).toBeUndefined();
    expect(parseSnapshot(snapshot({ protocol: undefined }))).toBeUndefined();
    expect(parseSnapshot(snapshot({ sessionId: "" }))).toBeUndefined();
    expect(parseSnapshot(snapshot({ sessionId: 7 }))).toBeUndefined();
    expect(parseSnapshot(undefined)).toBeUndefined();
    expect(parseSnapshot([snapshot()])).toBeUndefined();
  });

  test("a stopped session carries no tasks, whatever the message also holds", () => {
    const parsed = parseSnapshot(snapshot({ type: "stopped" }));
    expect(parsed?.type).toBe("stopped");
    expect(parsed?.tasks).toEqual([]);
  });

  test("drops a task it cannot render and a duplicate id", () => {
    const parsed = parseSnapshot(
      snapshot({
        tasks: [task(), task({ name: "second" }), task({ id: 2, state: "zombie" }), null, 5],
      }),
    );
    expect(parsed?.tasks.map((t) => t.name)).toEqual(["build"]);
  });

  test("never keeps more than a session's worth of tasks", () => {
    const tasks = Array.from({ length: 500 }, (_, index) => task({ id: index + 1 }));
    expect(parseSnapshot(snapshot({ tasks }))?.tasks).toHaveLength(200);
  });
});

describe("statusOf", () => {
  const word = (over: Partial<Record<keyof BgTask, unknown>>) =>
    statusOf(parseTask(task(over)) as BgTask);

  test("a live group is working, including one being stopped", () => {
    expect(word({ state: "stopping" })).toBe("working");
    expect(isLive("running")).toBe(true);
    expect(isLive("stopping")).toBe(true);
    expect(isLive("exited")).toBe(false);
    expect(isLive("failed")).toBe(false);
  });

  test("how it ended decides between done, idle and error", () => {
    expect(word({ state: "exited", code: 0 })).toBe("done");
    expect(word({ state: "exited", code: 2 })).toBe("error");
    // A signal is a stop the person asked for, not a failure to look at.
    expect(word({ state: "exited", code: null, signal: "SIGKILL" })).toBe("idle");
    expect(word({ state: "failed", code: null })).toBe("error");
  });
});

describe("monitorStateOf", () => {
  const word = (over: Partial<Record<keyof BgTask, unknown>>) =>
    monitorStateOf(parseTask(task(over)) as BgTask);

  test("speaks the words herdr-ui's monitor row knows", () => {
    expect(word({ state: "running" })).toBe("working");
    expect(word({ state: "stopping" })).toBe("working");
    expect(word({ state: "exited", code: 0 })).toBe("idle");
    expect(word({ state: "exited", code: 1 })).toBe("failed");
    expect(word({ state: "exited", code: null, signal: "SIGKILL" })).toBe("interrupted");
    expect(word({ state: "failed" })).toBe("failed");
    // Nothing to say: the row falls back to "Monitor".
    expect(word({ state: "exited", code: null, signal: null })).toBeUndefined();
  });
});

describe("BgSnapshot", () => {
  test("is what the event carries, so a replay keeps its session", () => {
    const parsed = parseSnapshot(snapshot()) as BgSnapshot;
    expect(parsed.protocol).toBe(1);
    expect(parsed.tasks[0]?.id).toBe(1);
  });
});
