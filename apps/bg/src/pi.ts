/**
 * Shell commands that outlive the tool call that started them: `bg_run` starts
 * one detached, `bg_wait` waits for it, `bg_status` shows the session's tasks
 * and `bg_stop` ends one.
 *
 * Nothing here wakes the agent. A task that ends sends one passive message — a
 * custom message with `triggerTurn: false` and no `deliverAs`, which pi stores
 * and draws and never turns into a run, idle or mid-turn — so the agent asks
 * `bg_wait` when it wants the result, and a build that ends after it has moved
 * on costs nothing. `bg_wait`'s own signal cancels the wait alone; the process
 * keeps running.
 *
 * Tasks belong to the session that started them: a shutdown (exit, `/new`,
 * `/reload`, a worktree move) kills them, ends their timers and stops their
 * waits, and a late exit reaches nothing. Every change is also published on
 * pi's event bus as one snapshot (`bg:state`), which is how Herdr's child
 * terminals follow them without this package knowing they exist.
 */
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  BG_RUN,
  BG_STATE,
  BG_STATE_REQUEST,
  BG_STATUS,
  BG_STOP,
  BG_WAIT,
  type BgSnapshot,
} from "./lib/protocol.ts";
import { detailText, endText, listText, startText, timeoutText } from "./lib/report.ts";
import { createTasks, type Tasks } from "./lib/tasks.ts";
import { TAIL } from "./lib/tail.ts";
import { instanceId, logPaths, readLogTail, setUnrefTimer, spawnDetached } from "./pi/node.ts";

type Live = { tasks: Tasks };

/** How long `bg_wait` waits before it hands back a task that is still running. */
const WAIT_SECONDS = 30;

const now = () => Date.now();

export default function (pi: ExtensionAPI) {
  let live: Live | undefined;

  const publish = (snapshot: BgSnapshot) => pi.events.emit(BG_STATE, snapshot);

  // Answered from the load, not from a session: a consumer that loads first, or
  // asks again after a reload, must still hear what this session is running.
  pi.events.on(BG_STATE_REQUEST, () => {
    if (live) publish(live.tasks.snapshot());
  });

  const tasksOf = (): Tasks => {
    if (!live) throw new Error("bg: no session is running this extension");
    return live.tasks;
  };

  pi.on("session_start", (_event, ctx) => {
    // A start without the shutdown before it would leave the previous tasks running and unowned.
    void live?.tasks.dispose();
    const sessionId = ctx.sessionManager.getSessionId();
    const tasks = createTasks({
      sessionId,
      instanceId: instanceId(),
      cwd: ctx.cwd,
      logPath: logPaths(sessionId),
      spawn: spawnDetached,
      readLog: readLogTail,
      now,
      setTimer: setUnrefTimer,
      publish,
      notify: ({ task, tail }) => {
        // Passive by construction: `triggerTurn: false` without `deliverAs` stores the message and
        // draws it, and starts no run whether the agent is idle or mid-turn. An idle completion is
        // appended at once, a busy one after the current turn ends, and neither wakes anything.
        pi.sendMessage(
          {
            customType: "bg-done",
            display: true,
            content: endText(task, tail, now()),
            details: {
              id: task.id,
              pid: task.pid,
              path: task.path,
              code: task.code,
              signal: task.signal,
            },
          },
          { triggerTurn: false },
        );
      },
    });
    live = { tasks };
    // An empty snapshot, so a consumer attached before this session knows its id.
    publish(tasks.snapshot());
  });

  pi.on("session_shutdown", async () => {
    const gone = live;
    live = undefined;
    // pi waits for this handler: by the time `/reload` or a quit continues, the
    // tasks are gone, SIGKILL included for those that ignored SIGTERM.
    await gone?.tasks.dispose();
  });

  pi.registerTool({
    name: BG_RUN,
    label: "Background",
    description: `Run a shell command detached in the cwd and return at once, for builds and tests that outlast a tool call. It never wakes you when it ends: call \`${BG_WAIT}\` with its id to wait for the exit code and last ${TAIL.lines} lines, \`${BG_STATUS}\` to see the session's tasks, or \`${BG_STOP}\` to end it.`,
    promptSnippet: "Run a long command in the background; wait for it with bg_wait.",
    parameters: Type.Object({
      command: Type.String({ description: "Bash command line" }),
      name: Type.Optional(Type.String({ description: "Short label for status and wait output" })),
      timeoutSeconds: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: 86_400,
          description: `End it this long after it starts, as \`${BG_STOP}\` would. Default: run until it ends or is stopped.`,
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const task = await tasksOf().run({
        command: params.command,
        name: params.name,
        // The cwd now, not the one the session started in: a worktree move keeps this ctx current.
        cwd: ctx.cwd,
        ...(params.timeoutSeconds === undefined ? {} : { timeoutMs: params.timeoutSeconds * 1000 }),
      });
      return {
        content: [{ type: "text" as const, text: startText(task) }],
        details: { id: task.id, pid: task.pid, path: task.path },
      };
    },
  });

  pi.registerTool({
    name: BG_WAIT,
    label: "Wait for background",
    description: `Wait for a ${BG_RUN} task of this session to end, and return its exit code and the last ${TAIL.lines} lines of its output. Stops waiting after ${WAIT_SECONDS} seconds by default and says the task is still running, so call it again to keep waiting. Aborting the wait leaves the process running.`,
    promptSnippet: "Wait for a background task to end and read its result.",
    parameters: Type.Object({
      id: Type.Integer({ minimum: 1, description: `The id ${BG_RUN} returned` }),
      timeoutSeconds: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: 86_400,
          description: `Give up after this long and return what the log holds now. Default: ${WAIT_SECONDS}.`,
        }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const tasks = tasksOf();
      const outcome = await tasks.wait(params.id, {
        signal,
        timeoutMs: (params.timeoutSeconds ?? WAIT_SECONDS) * 1000,
      });
      const ended = outcome.kind === "ended";
      return {
        content: [
          {
            type: "text" as const,
            text: ended
              ? endText(outcome.task, outcome.tail, now())
              : timeoutText(outcome.task, outcome.tail, now()),
          },
        ],
        details: {
          id: outcome.task.id,
          state: outcome.task.state,
          code: outcome.task.code,
          signal: outcome.task.signal,
          path: outcome.task.path,
          timedOut: !ended,
        },
      };
    },
  });

  pi.registerTool({
    name: BG_STATUS,
    label: "Background status",
    description: `List this session's ${BG_RUN} tasks with their state, or take one id for its log's tail and how it runs.`,
    promptSnippet: "See the background tasks of this session.",
    parameters: Type.Object({
      id: Type.Optional(Type.Integer({ minimum: 1, description: "One task, in full" })),
    }),
    async execute(_toolCallId, params) {
      const tasks = tasksOf();
      const all = tasks.list();
      const task = params.id === undefined ? undefined : tasks.get(params.id);
      const text =
        task === undefined ? listText(all, now()) : detailText(task, tasks.tail(task.id), now());
      return {
        content: [{ type: "text" as const, text }],
        details: { id: task?.id, count: all.length },
      };
    },
  });

  pi.registerTool({
    name: BG_STOP,
    label: "Stop background",
    description: `End a ${BG_RUN} task of this session: SIGTERM to its process group, then SIGKILL if it is still there after the grace. Never signals a pid you type.`,
    promptSnippet: "Stop a background task of this session.",
    parameters: Type.Object({
      id: Type.Integer({ minimum: 1, description: `The id ${BG_RUN} returned` }),
    }),
    async execute(_toolCallId, params) {
      const outcome = tasksOf().stop(params.id);
      const { task } = outcome;
      const text = outcome.escalated
        ? `#${task.id} got SIGKILL: it had not exited ${Math.round(outcome.graceMs / 1000)}s after SIGTERM. Log: ${task.path}`
        : `#${task.id} stopping: SIGTERM sent to its process group, SIGKILL in ${Math.round(outcome.graceMs / 1000)}s unless it exits. \`${BG_WAIT}\` with \`{"id":${task.id}}\` returns when it is gone. Log: ${task.path}`;
      return {
        content: [{ type: "text" as const, text }],
        details: { id: task.id, pid: task.pid, state: task.state, escalated: outcome.escalated },
      };
    },
  });
}
