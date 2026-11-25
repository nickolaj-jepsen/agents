/**
 * What this package publishes on pi's shared event bus, so that another
 * package can follow this session's background tasks without importing it
 * (Herdr's child terminals are one such consumer).
 *
 * Every change is one complete snapshot: a consumer holds no state of its own
 * and cannot drift. Finished tasks stay in the list until the session ends, so
 * their logs stay reachable; `type: "stopped"` then empties it.
 */
export const BG_STATE = "bg:state";
export const BG_STATE_REQUEST = "bg:state:request";
export const PROTOCOL = 1;

/** The tool names, which the tasks' messages and the docs quote. */
export const BG_RUN = "bg_run";
export const BG_WAIT = "bg_wait";
export const BG_STATUS = "bg_status";
export const BG_STOP = "bg_stop";

/**
 * `running`: spawned, nothing sent to it. `stopping`: a stop signalled it and
 * the kill that follows is pending. `exited`: it ended, by a code or a signal.
 * `failed`: it never started, and has no pid.
 */
export const TASK_STATES = ["running", "stopping", "exited", "failed"] as const;

export type TaskState = (typeof TASK_STATES)[number];

/** Whether the task's process group may still be alive. */
export const isRunning = (state: TaskState): boolean => state === "running" || state === "stopping";

/** One task, as a consumer reads it. `pid` is the detached group leader. */
export type TaskSnapshot = {
  id: number;
  name: string;
  pid: number | null;
  /** The task's log file, absolute. */
  path: string;
  cwd: string;
  command: string;
  state: TaskState;
  /** `null` while it runs, and after a signal ended it. */
  code: number | null;
  /** The signal that ended it, else `null`. */
  signal: string | null;
  startedAt: number;
  finishedAt: number | null;
};

export type BgSnapshot = {
  protocol: 1;
  sessionId: string;
  /** One per extension load: a reload numbers its snapshots from one again. */
  instanceId: string;
  sequence: number;
  type: "snapshot" | "stopped";
  tasks: readonly TaskSnapshot[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

const isTask = (value: unknown): value is TaskSnapshot =>
  isRecord(value) &&
  isId(value.id) &&
  typeof value.name === "string" &&
  (value.pid === null || isId(value.pid)) &&
  typeof value.path === "string" &&
  typeof value.cwd === "string" &&
  typeof value.command === "string" &&
  typeof value.state === "string" &&
  (TASK_STATES as readonly string[]).includes(value.state) &&
  (value.code === null || isId(value.code)) &&
  (value.signal === null || typeof value.signal === "string") &&
  typeof value.startedAt === "number" &&
  (value.finishedAt === null || typeof value.finishedAt === "number");

/** A whole snapshot, or `undefined`: a partial one would invent tasks. */
export const parseSnapshot = (value: unknown): BgSnapshot | undefined => {
  if (!isRecord(value) || value.protocol !== PROTOCOL) return undefined;
  if (typeof value.sessionId !== "string" || value.sessionId === "") return undefined;
  if (typeof value.instanceId !== "string" || value.instanceId === "") return undefined;
  if (!isId(value.sequence) || value.sequence < 1) return undefined;
  if (value.type !== "snapshot" && value.type !== "stopped") return undefined;
  if (!Array.isArray(value.tasks) || !value.tasks.every(isTask)) return undefined;
  return value as BgSnapshot;
};
