/**
 * What a foreground session (`live`) owns while a person drives it: the screen they see, a
 * replacement it confirmed, one still starting, and the watch whose saves start either.
 *
 * Leaving is one drain, in one order: abort first, then stop the watch and let the batch it was
 * handling settle, then end whatever replacement the exit raced. A late replay therefore cannot
 * take the screen after the person left, and no staged session keeps its run folder.
 */
import { rmSync } from "node:fs";
import { options } from "./options.ts";

/** A session whose run folder this process removes when it ends it. */
export type Owned = { runDir: string; close(): Promise<void> };

/** What a `live` invocation has to end when the person leaves. */
export type Foreground<T extends Owned> = {
  /** Signals the monitor and any in-flight replay; a save cannot start work after the stop below. */
  abort(): void;
  /** Stops new batches, drops the queued ones, and resolves once the batch in flight has settled. */
  stopWatching(): Promise<void>;
  /** The session on screen now, if any. */
  session?: T;
  /** A replacement confirmed but not yet taken by the loop. */
  staged?: T | Error;
  /** A replacement still starting; its run folder is its own. */
  starting?: Promise<T | undefined>;
  /** The run's original folder, whose stub stands in for a session this process ended. */
  origin: { runDir: string; stopStub(): void };
};

const removeRun = (dir: string) => {
  if (!options.keep) rmSync(dir, { recursive: true, force: true });
};

async function end<T extends Owned>(session: T): Promise<void> {
  try {
    await session.close();
  } finally {
    removeRun(session.runDir);
  }
}

export async function drainForeground<T extends Owned>(f: Foreground<T>): Promise<void> {
  // Before any wait: a replay that already reached this point sees the abort and ends its own
  // candidate, and a monitor still open is signalled rather than left with a raw terminal.
  f.abort();
  await f.stopWatching();
  const late = await f.starting?.catch(() => undefined);
  if (late) await end(late);
  // The loop may have exited between confirming a replacement and taking it.
  if (f.staged && !(f.staged instanceof Error)) await end(f.staged);
  if (f.session) await end(f.session);
  else f.origin.stopStub();
  removeRun(f.origin.runDir);
}

/**
 * Resolves with the child's exit code once it has *closed*, and only rejects for a spawn that failed
 * when the person did not abort. `spawn({signal})` reports an `AbortError` before the child is
 * gone; that and `exit` say nothing about its stdio being released, so the run folder waits for
 * `close` rather than being removed from under a process still writing to it.
 */
export function waitForChildClose(
  child: import("node:child_process").ChildProcess,
  signal: AbortSignal,
): Promise<number | null> {
  return new Promise<number | null>((resolve, reject) => {
    let spawnError: Error | undefined;
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code) => {
      // An aborted spawn is expected to error; the child still closed, which is what was awaited.
      if (spawnError && !signal.aborted) reject(spawnError);
      else resolve(code);
    });
  });
}
