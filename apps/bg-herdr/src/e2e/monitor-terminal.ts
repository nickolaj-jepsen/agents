/**
 * The recording's own terminal, running the monitor.
 *
 * A recording photographs the session it started, and a session is always an agent: Claude Code or
 * pi. This plugin draws nothing in either — what it draws is the Herdr child terminal, which is a
 * program of its own writing a frame to a pty. So this step ends the agent's terminal and puts a
 * real one in its place, started on the monitor script the plugin wrote (`bgTask`) at the
 * recording's size. Every cell of the picture is that program's own output, as Herdr's child
 * terminal receives it; this file draws none of it.
 *
 * The one thing it reaches into is the recorder's terminal, swapped after the agent's has done its
 * part. A driver that could start a session on a program rather than an agent would replace this
 * with its own option.
 *
 * Cleanup: the agent's terminal is closed here, as soon as the monitor's is up, and the recorder
 * closes the monitor's when the scenario ends, so neither a pi session nor a monitor outlives the
 * picture. Nothing here touches a Herdr core: the monitor is started directly on the record and log
 * `bgTask` wrote, so a person's own `hc` and its terminals are never read, started or stopped.
 */
import { join } from "node:path";
import type { Session } from "@agents/drive/lib/session.ts";
import { DaemonTerm, type Term } from "@agents/drive/lib/term.ts";
import { taskDir } from "./fixture.ts";

/** One per recording, so two scenarios recording at once keep their own terminal. */
let started = 0;

/** Starts the monitor in a terminal of its own and hands it to the recorder. */
export async function showMonitor(session: Session): Promise<void> {
  const { cols, rows } = await session.size();
  const dir = taskDir(session.runDir);
  const term = await DaemonTerm.launch(
    {
      program: process.execPath,
      // The monitor's own arguments: the record it reads, and the process it stops with.
      args: [join(dir, "monitor.mjs"), join(dir, "task.json"), String(process.pid)],
      cwd: session.cwd,
      env: {},
      unset: [],
      cols,
      rows,
    },
    `bg-herdr-monitor-${process.pid}-${++started}`,
  );
  // The agent has done its part: from here the recorder reads and photographs the monitor. Its
  // terminal is closed rather than left running, so nothing of the pi session outlives the picture.
  await session.term.close();
  (session as unknown as { term: Term }).term = term;
}
