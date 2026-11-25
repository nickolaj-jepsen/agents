import { describe, expect, it } from "vitest";
import { parseSnapshot, type BgSnapshot } from "./protocol.ts";
import {
  createTasks,
  type Completion,
  type Exit,
  type KillSignal,
  type Process,
  type TasksDeps,
} from "./tasks.ts";

type Fake = Process & {
  kills: KillSignal[];
  exit(code: number | null, signal?: string | null): void;
};

type Timer = { ms: number; cancelled: boolean; run(): void };

/** `createTasks` over a clock, timers and processes a test drives by hand. */
function harness(overrides: Partial<TasksDeps> & { spawnError?: Error } = {}) {
  let clock = 1_700_000_000_000;
  let pid = 4000;
  const published: BgSnapshot[] = [];
  const notified: Completion[] = [];
  const processes: Fake[] = [];
  const timers: Timer[] = [];
  const logs = new Map<string, string>();

  const start = (): Fake => {
    let settle!: (exit: Exit) => void;
    const exited = new Promise<Exit>((resolve) => {
      settle = resolve;
    });
    const kills: KillSignal[] = [];
    const child: Fake = {
      pid: (pid += 1),
      exited,
      kills,
      kill: (signal) => void kills.push(signal),
      exit: (code, signal = null) => settle({ code, signal }),
    };
    processes.push(child);
    return child;
  };

  const deps: TasksDeps = {
    sessionId: "session-1",
    instanceId: "instance-1",
    cwd: "/repo",
    logPath: (id) => `/logs/instance-1/${id}.log`,
    spawn: async (_command, { logPath }) => {
      if (overrides.spawnError) throw overrides.spawnError;
      logs.set(logPath, "");
      return start();
    },
    readLog: (path, maxBytes) => {
      const bytes = new TextEncoder().encode(logs.get(path) ?? "");
      const cut = bytes.byteLength > maxBytes;
      return { bytes: cut ? bytes.slice(bytes.byteLength - maxBytes) : bytes, cut };
    },
    now: () => clock,
    setTimer: (run, ms) => {
      const timer: Timer = {
        ms,
        cancelled: false,
        run: () => {
          if (!timer.cancelled) run();
        },
      };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    publish: (snapshot) => void published.push(snapshot),
    notify: (completion) => void notified.push(completion),
    ...overrides,
  };
  return {
    deps,
    /** A process a test can hand a pending spawn, so it lands when the test says. */
    make: start,
    published,
    notified,
    processes,
    timers,
    logs,
    tick: (ms: number) => {
      clock += ms;
    },
    now: () => clock,
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("createTasks", () => {
  it("reports a running task, then its exit, without waking anything else", async () => {
    const h = harness();
    const tasks = createTasks(h.deps);
    const task = await tasks.run({ command: "make test" });

    expect(task).toMatchObject({
      id: 1,
      name: "make test",
      pid: 4001,
      cwd: "/repo",
      path: "/logs/instance-1/1.log",
      state: "running",
      code: null,
      signal: null,
      finishedAt: null,
    });
    expect(h.published).toHaveLength(1);
    expect(parseSnapshot(h.published[0])?.tasks.map((t) => t.state)).toEqual(["running"]);

    h.logs.set(task.path, "building\nbuilt\n");
    h.tick(4200);
    h.processes[0]?.exit(0);
    await flush();

    expect(h.notified).toHaveLength(1);
    expect(h.notified[0]?.task).toMatchObject({
      state: "exited",
      code: 0,
      signal: null,
      finishedAt: h.now(),
    });
    expect(h.notified[0]?.tail.text).toBe("building\nbuilt");
    expect(parseSnapshot(h.published.at(-1))?.tasks[0]?.state).toBe("exited");
    // The snapshot is the only other sink: `notify` is the one channel a session hears from.
    expect(h.published).toHaveLength(2);
  });

  it("keeps a nonzero code and a signal apart", async () => {
    const h = harness();
    const tasks = createTasks(h.deps);
    const first = await tasks.run({ command: "exit 3" });
    const second = await tasks.run({ command: "sleep 100" });

    h.processes[0]?.exit(3);
    h.processes[1]?.exit(null, "SIGTERM");
    await flush();

    expect(tasks.get(first.id)).toMatchObject({ state: "exited", code: 3, signal: null });
    expect(tasks.get(second.id)).toMatchObject({ state: "exited", code: null, signal: "SIGTERM" });
    expect(h.notified.map((completion) => completion.task.state)).toEqual(["exited", "exited"]);
  });

  it("records a command that cannot start, and notifies nothing", async () => {
    const h = harness({ spawnError: new Error("spawn bash ENOENT") });
    const tasks = createTasks(h.deps);

    await expect(tasks.run({ command: "true" })).rejects.toThrow(
      /#1 could not start: spawn bash ENOENT/,
    );
    expect(tasks.list()).toMatchObject([
      { id: 1, pid: null, state: "failed", error: "spawn bash ENOENT" },
    ]);
    expect(parseSnapshot(h.published.at(-1))?.tasks[0]).toMatchObject({
      pid: null,
      state: "failed",
    });
    expect(h.notified).toHaveLength(0);
  });

  it("stops with SIGTERM, then SIGKILL once the grace is over", async () => {
    const h = harness({ graceMs: 5000 });
    const tasks = createTasks(h.deps);
    const task = await tasks.run({ command: "sleep 100" });

    const stopping = tasks.stop(task.id);
    expect(stopping).toMatchObject({ graceMs: 5000, escalated: false });
    expect(h.processes[0]?.kills).toEqual(["SIGTERM"]);
    expect(tasks.get(task.id).state).toBe("stopping");
    expect(h.timers.map((timer) => timer.ms)).toEqual([5000]);

    // The grace passes and the task has not gone.
    h.timers[0]?.run();
    expect(h.processes[0]?.kills).toEqual(["SIGTERM", "SIGKILL"]);

    h.processes[0]?.exit(null, "SIGKILL");
    await flush();
    expect(tasks.get(task.id)).toMatchObject({ state: "exited", signal: "SIGKILL" });
    expect(() => tasks.stop(task.id)).toThrow(/already ended/);
  });

  it("escalates at once when a stop is asked for twice, and never after the exit", async () => {
    const h = harness();
    const tasks = createTasks(h.deps);
    const task = await tasks.run({ command: "sleep 100" });

    tasks.stop(task.id);
    expect(tasks.stop(task.id).escalated).toBe(true);
    expect(h.processes[0]?.kills).toEqual(["SIGTERM", "SIGKILL"]);
    expect(h.timers[0]?.cancelled).toBe(true);

    h.processes[0]?.exit(null, "SIGKILL");
    await flush();
    h.timers[0]?.run();
    expect(h.processes[0]?.kills).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("ends a wait on the exit it was waiting for", async () => {
    const h = harness();
    const tasks = createTasks(h.deps);
    const task = await tasks.run({ command: "make" });
    h.logs.set(task.path, "done\n");

    const waiting = tasks.wait(task.id);
    h.processes[0]?.exit(0);
    await expect(waiting).resolves.toMatchObject({
      kind: "ended",
      task: { code: 0 },
      tail: { text: "done" },
    });
  });

  it("cancels a wait on its signal alone, leaving the process to run", async () => {
    const h = harness();
    const tasks = createTasks(h.deps);
    const task = await tasks.run({ command: "sleep 100" });
    const abort = new AbortController();

    const waiting = tasks.wait(task.id, { signal: abort.signal });
    abort.abort();
    await expect(waiting).rejects.toThrow(new RegExp(`#${task.id}; it is still running`));
    await expect(waiting).rejects.toHaveProperty("name", "AbortError");
    expect(h.processes[0]?.kills).toEqual([]);
    expect(tasks.get(task.id).state).toBe("running");
    expect(h.timers).toHaveLength(0);

    // A signal already aborted keeps the wait from starting at all.
    await expect(tasks.wait(task.id, { signal: abort.signal })).rejects.toHaveProperty(
      "name",
      "AbortError",
    );
  });

  it("hands back what the log holds when a wait times out", async () => {
    const h = harness();
    const tasks = createTasks(h.deps);
    const task = await tasks.run({ command: "sleep 100" });
    h.logs.set(task.path, "step 1\nstep 2\n");

    const waiting = tasks.wait(task.id, { timeoutMs: 30_000 });
    expect(h.timers.at(-1)?.ms).toBe(30_000);
    h.timers.at(-1)?.run();
    await expect(waiting).resolves.toMatchObject({
      kind: "timeout",
      task: { state: "running" },
      tail: { text: "step 1\nstep 2" },
    });
    expect(h.processes[0]?.kills).toEqual([]);
  });

  it("ends the session's tasks, waits for them, and says nothing about their exits", async () => {
    const h = harness();
    const tasks = createTasks(h.deps);
    const task = await tasks.run({ command: "sleep 100" });
    const waiting = tasks.wait(task.id);

    const disposing = tasks.dispose();
    expect(h.processes[0]?.kills).toEqual(["SIGTERM"]);
    await expect(waiting).rejects.toThrow(/the session ended/);
    expect(h.published.at(-1)).toMatchObject({ type: "stopped", tasks: [] });

    // The shutdown holds a second task's worth of nothing: it is done when the task is.
    let done = false;
    void disposing.then(() => (done = true));
    await flush();
    expect(done).toBe(false);
    h.processes[0]?.exit(null, "SIGTERM");
    await disposing;
    expect(h.processes[0]?.kills).toEqual(["SIGTERM"]);

    expect(h.notified).toHaveLength(0);
    await expect(tasks.run({ command: "true" })).rejects.toThrow(/the session has ended/);
  });

  it("kills a task whose spawn lands after the session ended, and says nothing", async () => {
    const h = harness();
    let land: (process: Process) => void = () => {};
    const tasks = createTasks({
      ...h.deps,
      spawn: () => new Promise<Process>((resolve) => (land = resolve)),
    });

    const starting = tasks.run({ command: "sleep 100" });
    // The shutdown finds a task with no process yet, and does not wait for one.
    await tasks.dispose();
    const published = h.published.length;
    expect(h.notified).toHaveLength(0);

    const child = h.make();
    land(child);
    await expect(starting).rejects.toThrow(/started just as the session ended/);
    // It is signalled at once, and the kill a shutdown promised still follows.
    expect(child.kills).toEqual(["SIGTERM"]);
    expect(h.timers.at(-1)?.ms).toBe(1000);
    h.timers.at(-1)?.run();
    expect(child.kills).toEqual(["SIGTERM", "SIGKILL"]);

    child.exit(null, "SIGKILL");
    await flush();
    expect(h.notified).toHaveLength(0);
    // Neither side published a snapshot after the stopped one.
    expect(h.published).toHaveLength(published);
    expect(tasks.list()).toEqual([]);
  });

  it("kills what ignores SIGTERM before a shutdown returns", async () => {
    const h = harness({ shutdownGraceMs: 1000 });
    const tasks = createTasks(h.deps);
    await tasks.run({ command: "sleep 100" });

    const disposing = tasks.dispose();
    expect(h.processes[0]?.kills).toEqual(["SIGTERM"]);
    // The grace runs out with the task still there.
    expect(h.timers.at(-1)?.ms).toBe(1000);
    h.timers.at(-1)?.run();
    await flush();

    expect(h.processes[0]?.kills).toEqual(["SIGTERM", "SIGKILL"]);
    // A moment for the kill to land, then the shutdown gives up rather than hang.
    expect(h.timers.at(-1)?.ms).toBe(250);
    h.processes[0]?.exit(null, "SIGKILL");
    await disposing;
    expect(h.notified).toHaveLength(0);
  });

  it("stops a task on its own timeout, as a stop would", async () => {
    const h = harness({ graceMs: 5000 });
    const tasks = createTasks(h.deps);
    const task = await tasks.run({ command: "sleep 100", timeoutMs: 60_000 });
    expect(h.timers.at(-1)?.ms).toBe(60_000);

    h.timers.at(-1)?.run();
    expect(h.processes[0]?.kills).toEqual(["SIGTERM"]);
    expect(tasks.get(task.id).state).toBe("stopping");
    expect(h.timers.at(-1)?.ms).toBe(5000);

    h.processes[0]?.exit(null, "SIGTERM");
    await flush();
    // The kill the timeout's stop scheduled is off.
    expect(h.timers.at(-1)?.cancelled).toBe(true);
    expect(tasks.get(task.id)).toMatchObject({ state: "exited", signal: "SIGTERM" });
  });

  it("runs a task in the cwd it is given, not the session's", async () => {
    const h = harness();
    const tasks = createTasks(h.deps);
    const seen: string[] = [];
    const task = await createTasks({
      ...h.deps,
      spawn: (command, options) => {
        seen.push(options.cwd);
        return h.deps.spawn(command, options);
      },
    }).run({ command: "true", cwd: "/elsewhere" });
    expect(seen).toEqual(["/elsewhere"]);
    expect(task.cwd).toBe("/elsewhere");
    expect(tasks.list()).toEqual([]);
  });

  it("publishes one numbered snapshot of the whole session each time", async () => {
    const h = harness();
    const tasks = createTasks(h.deps);
    expect(tasks.snapshot()).toEqual({
      protocol: 1,
      sessionId: "session-1",
      instanceId: "instance-1",
      sequence: 1,
      type: "snapshot",
      tasks: [],
    });
    const first = await tasks.run({ command: "one" });
    await tasks.run({ command: "two" });
    const last = h.published.at(-1);
    expect(last?.sequence).toBe(3);
    expect(last?.tasks.map((task) => task.id)).toEqual([first.id, first.id + 1]);
    expect(parseSnapshot(last)).toBeDefined();
  });

  it("refuses an id this session did not start", async () => {
    const tasks = createTasks(harness().deps);
    expect(() => tasks.get(7)).toThrow(/not a task of this session/);
    expect(() => tasks.stop(7)).toThrow(/not a task of this session/);
    await expect(async () => tasks.wait(7)).rejects.toThrow(/not a task of this session/);
  });
});
