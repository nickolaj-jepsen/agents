/**
 * The `bg:state` snapshot, protocol 1, as the bg extension emits it, and the
 * one mapping from a task's lifecycle to the word Herdr shows.
 *
 * Everything here is untrusted input: the snapshot arrives on pi's event bus
 * from another package, so a task is only kept when its id, lifecycle and start
 * time are the shapes bg promises, and every text field is bounded before it can
 * reach a terminal or a label.
 */

export const PROTOCOL = 1;

/** bg's closed lifecycle: `running` and `stopping` still have a live process group. */
export const TASK_STATES = ["running", "stopping", "exited", "failed"] as const;
export type TaskState = (typeof TASK_STATES)[number];

export interface BgTask {
  /** Session-scoped, increasing; `-pid` is the group a stop signals. */
  id: number;
  name: string;
  /** The detached process-group leader, or null once it never started. */
  pid: number | null;
  /** Absolute log file path: what the monitor tails. */
  path: string;
  cwd: string;
  command: string;
  state: TaskState;
  code: number | null;
  signal: string | null;
  startedAt: number;
  finishedAt: number | null;
}

export interface BgSnapshot {
  protocol: typeof PROTOCOL;
  sessionId: string;
  instanceId: string;
  /** Increases per emit within one instance, so a late message is droppable. */
  sequence: number;
  type: "snapshot" | "stopped";
  tasks: BgTask[];
}

/** Fields the monitor cannot invent: without them a task never becomes a terminal. */
const STATES: ReadonlySet<string> = new Set(TASK_STATES);
const LIMITS = { name: 200, command: 2_000, cwd: 400, path: 400, signal: 32, id: 64 };
// A hostile snapshot could hold thousands of tasks; a session's own list is small.
const MAX_TASKS = 200;

const text = (value: unknown, limit: number): string =>
  typeof value === "string" ? value.slice(0, limit) : "";

const token = (value: unknown, limit: number): string | undefined => {
  const value2 = text(value, limit).trim();
  return value2 === "" ? undefined : value2;
};

const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const whole = (value: unknown): number | null => {
  const number = finite(value);
  return number === undefined ? null : Math.trunc(number);
};

/** One task, or undefined when it lacks an id, a known lifecycle or a start time. */
export function parseTask(value: unknown): BgTask | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const task = value as Record<string, unknown>;
  const id = finite(task.id);
  const state = task.state;
  const startedAt = finite(task.startedAt);
  if (id === undefined || !Number.isInteger(id) || id <= 0) return undefined;
  if (typeof state !== "string" || !STATES.has(state)) return undefined;
  if (startedAt === undefined || startedAt <= 0) return undefined;
  const pid = whole(task.pid);
  return {
    id,
    name: text(task.name, LIMITS.name),
    // A group leader is a positive pid; anything else is "no process".
    pid: pid !== null && pid > 0 ? pid : null,
    path: text(task.path, LIMITS.path),
    cwd: text(task.cwd, LIMITS.cwd),
    command: text(task.command, LIMITS.command),
    state: state as TaskState,
    code: whole(task.code),
    signal: token(task.signal, LIMITS.signal) ?? null,
    startedAt,
    finishedAt: whole(task.finishedAt),
  };
}

/** A whole snapshot, or undefined when it is not protocol 1 or has no session. */
export function parseSnapshot(value: unknown): BgSnapshot | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const snapshot = value as Record<string, unknown>;
  if (finite(snapshot.protocol) !== PROTOCOL) return undefined;
  const sessionId = token(snapshot.sessionId, LIMITS.id);
  if (sessionId === undefined) return undefined;
  // A type we do not know is not a snapshot we can trust: one added later may
  // mean something else, and drawing it as a list would show stale tasks.
  const type = snapshot.type;
  if (type !== "snapshot" && type !== "stopped") return undefined;
  const instanceId = text(snapshot.instanceId, LIMITS.id);
  const sequence = finite(snapshot.sequence) ?? 0;
  const tasks: BgTask[] = [];
  const seen = new Set<number>();
  // A stopped session has no tasks, whatever the message also carries.
  for (const entry of type === "stopped" || !Array.isArray(snapshot.tasks) ? [] : snapshot.tasks) {
    if (tasks.length >= MAX_TASKS) break;
    const task = parseTask(entry);
    if (!task || seen.has(task.id)) continue;
    seen.add(task.id);
    tasks.push(task);
  }
  return {
    protocol: PROTOCOL,
    sessionId,
    instanceId,
    sequence: Math.trunc(sequence),
    type,
    tasks,
  };
}

/** Still owns a live process group: the task may still write to its log. */
export const isLive = (state: TaskState): boolean => state === "running" || state === "stopping";

/** The word in the OSC 7501 status Herdr reads, one per lifecycle and exit. */
export function statusOf(task: Pick<BgTask, "state" | "code" | "signal">): string {
  if (isLive(task.state)) return "working";
  if (task.state === "failed") return "error";
  // Exited: a clean code is done, a signal is a stop the person asked for, a
  // non-zero code is the failure they need to look at.
  if (task.signal !== null) return "idle";
  return task.code === 0 ? "done" : "error";
}

/**
 * The lifecycle word herdr-ui's monitor row reads from the terminal's labels
 * (`mods/nested-spaces/monitor-row.js`): `working`, `waiting`, `idle` (shown as
 * "Finished"), `failed` or `interrupted`. Undefined leaves the row as "Monitor"
 * rather than claiming an ending we cannot vouch for.
 */
export function monitorStateOf(
  task: Pick<BgTask, "state" | "code" | "signal">,
): string | undefined {
  switch (task.state) {
    case "running":
    case "stopping":
      return "working";
    case "failed":
      return "failed";
    case "exited":
      if (task.signal !== null) return "interrupted";
      if (task.code === null) return undefined;
      return task.code === 0 ? "idle" : "failed";
    default:
      return undefined;
  }
}
