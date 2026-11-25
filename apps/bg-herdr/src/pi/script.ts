import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MonitorIo } from "./monitor.ts";

/**
 * The monitor runs as its own program, so the script it runs is written from
 * `monitorMain`'s source: the repo's bundler ships `src/pi.ts` and no side
 * files, so anything the script needed from a module scope would be missing in
 * `dist/`. The prelude is fixed text and the function is passed as a value, so
 * no part of this is a shell command, and no snapshot field is ever interpolated
 * into code.
 */
const PRELUDE = [
  'import { open, readFile } from "node:fs/promises";',
  'import { setTimeout as delay } from "node:timers/promises";',
].join("\n");

export function monitorScriptSource(
  main: (io: MonitorIo, snapshotPath: unknown, parentPid: unknown) => Promise<void>,
): string {
  return [
    "// The read-only monitor for one bg task, written by bg-herdr. Do not edit.",
    PRELUDE,
    `const monitor = ${main.toString().trim()};`,
    "await monitor(",
    "  { readFile, open, delay, write: (text) => process.stdout.write(text), now: () => Date.now() },",
    "  process.argv[2],",
    "  process.argv[3],",
    ");",
    "",
  ].join("\n");
}

/** Writes the script into the bridge's private folder and returns its path. */
export async function writeMonitorScript(
  dir: string,
  main: (io: MonitorIo, snapshotPath: unknown, parentPid: unknown) => Promise<void>,
): Promise<string> {
  const file = join(dir, "monitor.mjs");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(file, monitorScriptSource(main), { mode: 0o600 });
  return file;
}
