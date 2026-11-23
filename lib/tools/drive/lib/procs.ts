/** The processes of a run folder, found by name, and how to end them all. Linux only: elsewhere none. */
import { existsSync, readdirSync, readFileSync } from "node:fs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Every process of the run but this one and its parent: its command line or environment names the run folder. */
export function ofRun(runDir: string): number[] {
  if (!existsSync("/proc")) return [];
  const pids: number[] = [];
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    const pid = Number(name);
    if (pid === process.pid || pid === process.ppid) continue;
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8");
      const env = readFileSync(`/proc/${pid}/environ`, "utf8");
      if (cmd.includes(runDir) || env.includes(`=${runDir}/`)) pids.push(pid);
    } catch {
      /* gone, or not ours */
    }
  }
  return pids;
}

/**
 * Ends every process of the run. VS Code's main process can ignore SIGTERM, so what is left after
 * two seconds gets SIGKILL.
 */
export async function endRun(runDir: string) {
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    const pids = ofRun(runDir);
    if (pids.length === 0) return;
    for (const pid of pids)
      try {
        process.kill(pid, signal);
      } catch {
        /* already gone */
      }
    await sleep(signal === "SIGTERM" ? 2000 : 500);
  }
}

/** When `pid` started, where Linux says so: a pid that comes back with another start is another process. */
export function startOf(pid: number): string | undefined {
  try {
    // The command name, in parentheses, can hold spaces: count the fields after it.
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
  } catch {
    return undefined;
  }
}

/** Whether `pid` still runs and, given the start `startOf` saw, is still that process. */
export function alive(pid: number, start?: string): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  return start === undefined || startOf(pid) === start;
}
