/**
 * The fixture a monitor reads: one bg task as the bridge writes it.
 *
 * The bridge turns bg's `bg:state` snapshot into one record file per task and tails the task's log;
 * the monitor reads both and draws them. A recording has neither a bg session nor a Herdr core, so
 * this writes the same two files: the snapshot is shaped as bg emits one and goes through the same
 * `parseSnapshot` the bridge uses, and the monitor script comes from the plugin's own generator
 * (`writeMonitorScript`). Nothing the monitor draws is written here.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SetupContext } from "@agents/drive/lib/setup.ts";
import { parseSnapshot, PROTOCOL } from "../lib/state.ts";
import { monitorMain } from "../pi/monitor.ts";
import { writeMonitorScript } from "../pi/script.ts";

/** The folder `showMonitor` runs the monitor on: the record and the log it tails. */
export const taskDir = (runDir: string) => join(runDir, "task");

export type TaskSpec = {
  id: number;
  name: string;
  command: string;
  state: "running" | "exited";
  /** A live task's process group leader. */
  pid?: number;
  /** Ended: its exit code, or the signal that ended it (and then no code). */
  code?: number | null;
  signal?: string | null;
  /** How long before the recording it started. */
  startedAgo: number;
  /** Ended: how long it ran. */
  ranMs?: number;
  /** The last lines of its log, as the task wrote them. */
  log: string;
};

/**
 * Writes the task's log, the record the monitor reads and the monitor script, all inside `runDir`
 * so no path outside the run folder shows in the picture.
 */
export async function bgTask(ctx: SetupContext, spec: TaskSpec): Promise<void> {
  const dir = taskDir(ctx.runDir);
  mkdirSync(dir, { recursive: true });
  const log = join(dir, `${spec.id}.log`);
  writeFileSync(log, spec.log);
  const now = Date.now();
  const startedAt = now - spec.startedAgo;
  const snapshot = {
    protocol: PROTOCOL,
    sessionId: "e2e-bg-herdr",
    instanceId: "e2e",
    sequence: 1,
    type: "snapshot",
    tasks: [
      {
        id: spec.id,
        name: spec.name,
        pid: spec.pid ?? null,
        path: log,
        cwd: ctx.cwd,
        command: spec.command,
        state: spec.state,
        code: spec.code ?? null,
        signal: spec.signal ?? null,
        startedAt,
        finishedAt: spec.ranMs === undefined ? null : startedAt + spec.ranMs,
      },
    ],
  };
  const record = parseSnapshot(snapshot)?.tasks[0];
  if (!record) throw new Error("bg-herdr's fixture task is not a snapshot bg would emit");
  // The bridge writes `observedAt` beside the task; the monitor reads the record as it is.
  writeFileSync(join(dir, "task.json"), `${JSON.stringify({ ...record, observedAt: now })}\n`);
  await writeMonitorScript(dir, monitorMain);
}
