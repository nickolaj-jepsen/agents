/**
 * What a tool call says about a task. Plain lines: the model reads them, and a
 * person watching reads the same text in the transcript.
 */
import { BG_RUN, BG_STATUS, BG_STOP, BG_WAIT, isRunning, type TaskSnapshot } from "./protocol.ts";
import { TAIL, type LogTail } from "./tail.ts";

/** A task, with the reason a task that never started has no pid. */
export type Reported = TaskSnapshot & { error?: string };

/** Seconds a task has taken: up to now while it runs, else to its exit. */
export const secondsOf = (task: Reported, now: number): number =>
  Math.max(0, Math.round(((task.finishedAt ?? now) - task.startedAt) / 1000));

/** How it ended, or what it is doing: `exited 0`, `exited SIGTERM`, `running`, `failed`. */
export const stateText = (task: Reported): string => {
  if (task.state === "exited") return `exited ${task.code ?? task.signal ?? "?"}`;
  if (task.state === "failed") return "failed to start";
  return task.state;
};

/** The first line of a command, cut to fit a line. */
export const commandLine = (command: string, max = 100): string => {
  const line = (command.split("\n")[0] ?? "").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** The lines under a task's status: its log, and the tail when there is one. */
const tailLines = (tail: LogTail): string[] => {
  const lines = tail.text === "" ? ["(no output)"] : tail.text.split("\n");
  return tail.truncated
    ? [...lines, "(earlier output cut; the whole log is at the path above)"]
    : lines;
};

export const startText = (task: Reported): string =>
  [
    `#${task.id} started, pid ${task.pid ?? "?"}. Log: ${task.path}`,
    `Nothing interrupts you when it ends: \`${BG_WAIT}\` with \`{"id":${task.id}}\` returns its exit code and last ${TAIL.lines} lines once it does. \`${BG_STATUS}\` lists this session's tasks, and \`${BG_STOP}\` with that id ends it.`,
  ].join("\n");

export const endText = (task: Reported, tail: LogTail, now: number): string =>
  [
    `#${task.id} ${JSON.stringify(task.name)} ${stateText(task)} after ${secondsOf(task, now)}s. Log: ${task.path}`,
    ...tailLines(tail),
  ].join("\n");

/** A wait that gave up: the task runs on, and its log is where it is now. */
export const timeoutText = (task: Reported, tail: LogTail, now: number): string =>
  [
    `#${task.id} ${JSON.stringify(task.name)} still running after ${secondsOf(task, now)}s. Log: ${task.path}`,
    ...tailLines(tail),
  ].join("\n");

/** The whole session's tasks, one two-line entry each. */
export const listText = (tasks: readonly Reported[], now: number): string => {
  if (tasks.length === 0) return `No \`${BG_RUN}\` tasks in this session.`;
  const running = tasks.filter((task) => isRunning(task.state)).length;
  const header = `${tasks.length} task${tasks.length === 1 ? "" : "s"} in this session (${running} running):`;
  const rows = tasks.flatMap((task) => [
    `#${task.id} ${stateText(task)} ${secondsOf(task, now)}s ${JSON.stringify(task.name)}${task.pid === null ? "" : ` pid ${task.pid}`}`,
    `  log: ${task.path}`,
  ]);
  return [header, ...rows].join("\n");
};

/** One task in full: where it runs, what it ran, and the end of its log. */
export const detailText = (task: Reported, tail: LogTail, now: number): string => {
  const head = `#${task.id} ${JSON.stringify(task.name)} ${stateText(task)} after ${secondsOf(task, now)}s`;
  const meta = [
    `log: ${task.path}`,
    ...(task.pid === null ? [] : [`pid: ${task.pid} (its process group's leader)`]),
    ...(task.error === undefined ? [] : [`error: ${task.error}`]),
    `cwd: ${task.cwd}`,
    `command: ${commandLine(task.command)}`,
  ];
  return [head, ...meta, `last ${TAIL.lines} lines:`, ...tailLines(tail)].join("\n");
};
