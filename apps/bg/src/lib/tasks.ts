/**
 * This session's background tasks: the processes it started, their logs, and
 * the state another extension follows.
 *
 * An ending task is announced to `notify`, which only ever reports it: nothing
 * here starts a turn, so a build that finishes hours later cannot wake an agent
 * that has moved on. `wait` is how an agent asks for the result, and its signal
 * cancels the wait alone — never the process.
 *
 * The operating system is injected (`spawn`, `readLog`, `now`, `setTimer`), so
 * the lifecycle can be tested without one.
 */
import {
  BG_STATUS,
  BG_WAIT,
  PROTOCOL,
  isRunning,
  type BgSnapshot,
  type TaskSnapshot,
} from "./protocol.ts";
import type { Reported } from "./report.ts";
import { TAIL, tailOfLog, type LogRead, type LogTail } from "./tail.ts";

export type KillSignal = "SIGTERM" | "SIGKILL";

/** How a process ended: `code` for an exit, `signal` for a kill. */
export type Exit = { code: number | null; signal: string | null };

/** A process this session owns: the leader of a process group of its own. */
export type Process = {
  pid: number;
  /** Resolves once it has ended; never rejects. */
  exited: Promise<Exit>;
  /** Signals its whole group, and swallows a group that is already gone. */
  kill(signal: KillSignal): void;
};

export type Completion = { task: Reported; tail: LogTail };

export type TasksDeps = {
  sessionId: string;
  instanceId: string;
  cwd: string;
  /** Where the task's log goes: unique per id and per session instance. */
  logPath(id: number): string;
  /** Starts the command detached. Rejects when it cannot start at all. */
  spawn(command: string, options: { cwd: string; logPath: string }): Promise<Process>;
  /** At most `maxBytes` from the end of a log, and whether the front was cut. */
  readLog(path: string, maxBytes: number): LogRead;
  now(): number;
  /** Calls `run` once after `ms`, unless the returned function is called first. */
  setTimer(run: () => void, ms: number): () => void;
  publish(snapshot: BgSnapshot): void;
  /** Told when a task ends: passive, it must not start a turn. */
  notify(completion: Completion): void;
  /** How long a stop waits after SIGTERM before it sends SIGKILL. */
  graceMs?: number;
  /** How long a session's shutdown waits for SIGTERM before it kills what is left. */
  shutdownGraceMs?: number;
};

export type WaitOutcome = { kind: "ended" | "timeout"; task: Reported; tail: LogTail };

export type StopOutcome = { task: Reported; graceMs: number; escalated: boolean };

export type Tasks = {
  /**
   * Starts a command in `cwd` (the session's by default). `timeoutMs` stops it
   * as `bg_stop` would, once it has run that long.
   */
  run(input: {
    command: string;
    name?: string;
    cwd?: string;
    timeoutMs?: number;
  }): Promise<Reported>;
  /** SIGTERM now, SIGKILL after the grace unless it exits; asked twice, SIGKILL at once. */
  stop(id: number): StopOutcome;
  /** Waits for one task. Aborting rejects the wait and leaves the process alone. */
  wait(id: number, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<WaitOutcome>;
  get(id: number): Reported;
  list(): Reported[];
  tail(id: number): LogTail;
  snapshot(): BgSnapshot;
  /**
   * Ends every task: SIGTERM, then SIGKILL after the shutdown grace for those
   * still there. Resolves once they are gone, or a moment after the kill.
   */
  dispose(): Promise<void>;
};

type Waiter = {
  end(outcome: WaitOutcome): void;
  fail(error: Error): void;
};

type Entry = {
  task: Reported;
  process?: Process;
  done: boolean;
  waiters: Set<Waiter>;
  cancelEscalation?: () => void;
  /** A `timeoutMs` on the task itself: it ends as a stop would end it. */
  cancelTimeout?: () => void;
};

const abortError = (id: number, task: Reported): Error => {
  const error = new Error(
    `${BG_WAIT}: stopped waiting for #${id}; it is still running${task.pid === null ? "" : ` (pid ${task.pid})`}. Log: ${task.path}`,
  );
  error.name = "AbortError";
  return error;
};

export function createTasks(deps: TasksDeps): Tasks {
  const entries = new Map<number, Entry>();
  const graceMs = deps.graceMs ?? 5000;
  const shutdownGraceMs = deps.shutdownGraceMs ?? 1000;
  let next = 1;
  let sequence = 0;
  let closed = false;

  const view = (task: Reported): TaskSnapshot => ({
    id: task.id,
    name: task.name,
    pid: task.pid,
    path: task.path,
    cwd: task.cwd,
    command: task.command,
    state: task.state,
    code: task.code,
    signal: task.signal,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
  });

  const snapshotOf = (type: BgSnapshot["type"] = "snapshot"): BgSnapshot => ({
    protocol: PROTOCOL,
    sessionId: deps.sessionId,
    instanceId: deps.instanceId,
    sequence: (sequence += 1),
    type,
    tasks: type === "stopped" ? [] : [...entries.values()].map((entry) => view(entry.task)),
  });

  /** Publishes a change, unless the session has ended: nothing may resurrect a stopped snapshot. */
  const publish = () => {
    if (!closed) deps.publish(snapshotOf());
  };

  const readTail = (task: Reported): LogTail => {
    try {
      return tailOfLog(deps.readLog(task.path, TAIL.bytes), TAIL);
    } catch (error) {
      return {
        text: `(log unreadable: ${error instanceof Error ? error.message : String(error)})`,
        truncated: false,
      };
    }
  };

  const signal = (entry: Entry, how: KillSignal) => {
    // A group already gone is done: a freed pid may lead another group by now.
    entry.process?.kill(how);
  };

  const escalate = (entry: Entry, budgetMs = graceMs) => {
    entry.cancelEscalation?.();
    entry.cancelEscalation = deps.setTimer(() => {
      entry.cancelEscalation = undefined;
      // Guarded to a task this session still owns and that has not ended meanwhile.
      if (entry.done) return;
      signal(entry, "SIGKILL");
    }, budgetMs);
  };

  /** SIGTERM now, and the kill that follows if it is still there after the grace. */
  const beginStop = (entry: Entry) => {
    entry.cancelTimeout?.();
    entry.cancelTimeout = undefined;
    entry.task.state = "stopping";
    signal(entry, "SIGTERM");
    escalate(entry);
  };

  const end = (entry: Entry, exit: Exit) => {
    if (entry.done) return;
    entry.done = true;
    const { task } = entry;
    task.state = "exited";
    task.code = exit.code;
    task.signal = exit.signal;
    task.finishedAt = deps.now();
    entry.cancelEscalation?.();
    entry.cancelEscalation = undefined;
    entry.cancelTimeout?.();
    entry.cancelTimeout = undefined;
    const tail = readTail(task);
    const waiters = [...entry.waiters];
    entry.waiters.clear();
    for (const waiter of waiters) waiter.end({ kind: "ended", task, tail });
    if (closed) return;
    deps.publish(snapshotOf());
    // Passive: the session is told, and nothing here starts a turn for it.
    deps.notify({ task, tail });
  };

  const lookup = (id: number): Entry => {
    const entry = entries.get(id);
    if (!entry)
      throw new Error(`bg: #${id} is not a task of this session; \`${BG_STATUS}\` lists them.`);
    return entry;
  };

  const run: Tasks["run"] = async (input) => {
    if (closed) throw new Error("bg: the session has ended");
    const id = next++;
    const cwd = input.cwd ?? deps.cwd;
    const task: Reported = {
      id,
      name:
        input.name?.trim() || (input.command.split("\n")[0] ?? "").trim().slice(0, 60) || `#${id}`,
      pid: null,
      path: deps.logPath(id),
      cwd,
      command: input.command,
      state: "running",
      code: null,
      signal: null,
      startedAt: deps.now(),
      finishedAt: null,
    };
    const entry: Entry = { task, done: false, waiters: new Set() };
    entries.set(id, entry);

    let process: Process;
    try {
      process = await deps.spawn(input.command, { cwd, logPath: task.path });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      task.state = "failed";
      task.error = message;
      task.finishedAt = deps.now();
      entry.done = true;
      publish();
      throw new Error(`bg_run: #${id} could not start: ${message}`);
    }

    // The session can end while the spawn is in flight: `dispose` saw a task with no
    // process to signal, so this one is ours to kill, and it must not publish or notify.
    if (closed) {
      entry.process = process;
      task.pid = process.pid;
      signal(entry, "SIGTERM");
      // The same budget a shutdown gives what it caught, and the child still holds the loop
      // open, so the kill lands even though the session that asked for it is gone.
      escalate(entry, shutdownGraceMs);
      void process.exited.then((exit) => end(entry, exit));
      throw new Error(`bg: #${id} started just as the session ended, and was stopped`);
    }

    entry.process = process;
    task.pid = process.pid;
    if (input.timeoutMs !== undefined) {
      entry.cancelTimeout = deps.setTimer(() => {
        entry.cancelTimeout = undefined;
        if (entry.done) return;
        beginStop(entry);
        publish();
      }, input.timeoutMs);
    }
    publish();
    void process.exited.then((exit) => end(entry, exit));
    return task;
  };

  const stop: Tasks["stop"] = (id) => {
    const entry = lookup(id);
    const { task } = entry;
    if (entry.done)
      throw new Error(`#${id} already ended (${task.code ?? task.signal ?? "failed"}).`);
    if (!isRunning(task.state)) throw new Error(`#${id} is ${task.state}; nothing to stop.`);
    if (task.state === "stopping") {
      // Asked twice: no more waiting for a task that ignored SIGTERM.
      entry.cancelEscalation?.();
      entry.cancelEscalation = undefined;
      signal(entry, "SIGKILL");
      return { task, graceMs, escalated: true };
    }
    beginStop(entry);
    publish();
    return { task, graceMs, escalated: false };
  };

  const wait: Tasks["wait"] = (id, options = {}) => {
    const entry = lookup(id);
    const { task } = entry;
    const { signal: abort, timeoutMs } = options;
    if (entry.done) return Promise.resolve({ kind: "ended", task, tail: readTail(task) });
    if (abort?.aborted) return Promise.reject(abortError(id, task));

    return new Promise<WaitOutcome>((resolve, reject) => {
      let cancelTimer: (() => void) | undefined;
      let settled = false;
      // The wait lets go; the process runs on.
      const clean = () => {
        settled = true;
        entry.waiters.delete(waiter);
        cancelTimer?.();
        abort?.removeEventListener("abort", onAbort);
      };
      const waiter: Waiter = {
        end(outcome) {
          if (settled) return;
          clean();
          resolve(outcome);
        },
        fail(error) {
          if (settled) return;
          clean();
          reject(error);
        },
      };
      const onAbort = () => waiter.fail(abortError(id, task));
      entry.waiters.add(waiter);
      abort?.addEventListener("abort", onAbort, { once: true });
      if (timeoutMs !== undefined) {
        cancelTimer = deps.setTimer(() => {
          cancelTimer = undefined;
          waiter.end({ kind: "timeout", task, tail: readTail(task) });
        }, timeoutMs);
      }
    });
  };

  /** Resolves once every one of `pending` has ended, or when the budget runs out. */
  const settle = (pending: readonly Entry[], budgetMs: number): Promise<void> =>
    new Promise<void>((resolve) => {
      const open = pending.filter((entry) => !entry.done);
      let left = open.length;
      let finished = false;
      let cancelBudget: (() => void) | undefined;
      const stop = () => {
        if (finished) return;
        finished = true;
        cancelBudget?.();
        for (const entry of open) entry.waiters.delete(waiter);
        resolve();
      };
      const waiter: Waiter = {
        end: () => {
          left -= 1;
          if (left === 0) stop();
        },
        fail: () => {},
      };
      if (left === 0) {
        stop();
        return;
      }
      for (const entry of open) entry.waiters.add(waiter);
      cancelBudget = deps.setTimer(stop, budgetMs);
    });

  const dispose: Tasks["dispose"] = async () => {
    if (closed) return;
    // Before the signals, so the exits they cause reach nothing that is gone.
    closed = true;
    const ended = new Error("bg: the session ended while waiting");
    const stopping = [...entries.values()];
    for (const entry of stopping) {
      if (!entry.done) {
        entry.cancelTimeout?.();
        entry.cancelTimeout = undefined;
        // The session's own kill replaces whatever a stop had pending.
        entry.cancelEscalation?.();
        entry.cancelEscalation = undefined;
        entry.task.state = "stopping";
        signal(entry, "SIGTERM");
      }
      for (const waiter of entry.waiters) waiter.fail(ended);
      entry.waiters.clear();
    }
    deps.publish(snapshotOf("stopped"));
    entries.clear();

    // pi waits for this handler, so /reload and quit do not orphan a task that
    // ignores SIGTERM: nothing is left behind once it resolves.
    // A task whose spawn has not resolved yet has no process to wait for: `run` kills
    // the process when it lands, as a spawn that arrives after this.
    const pending = stopping.filter((entry) => !entry.done && entry.process !== undefined);
    if (pending.length === 0) return;
    await settle(pending, shutdownGraceMs);
    const stubborn = pending.filter((entry) => !entry.done);
    for (const entry of stubborn) signal(entry, "SIGKILL");
    if (stubborn.length > 0) await settle(stubborn, 250);
  };

  return {
    run,
    stop,
    wait,
    get: (id) => lookup(id).task,
    list: () => [...entries.values()].map((entry) => entry.task),
    tail: (id) => readTail(lookup(id).task),
    snapshot: () => snapshotOf(),
    dispose,
  };
}
