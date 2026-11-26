/**
 * Ctrl+C, as the Python CLI handled it: `KeyboardInterrupt` unwound the command through its
 * `finally` blocks — the temporary snapshot removed, the lock released — and `main` printed
 * `agents: interrupted` and returned 130.
 *
 * Node's default is to die where it stands, which would skip that cleanup (and, with a helper that
 * ignored the signal, could leave a lock held by a process nobody owns any more). So the entry
 * point installs this handler and the commands check `throwIfInterrupted()` at the boundaries they
 * can safely unwind from: after a git call, after a build, before a state write, and around each
 * live-reload delivery.
 */
export class InterruptError extends Error {
  override name = "InterruptError";
}

let requested = false;
let installed = false;
const listeners = new Set<() => void>();

export function installInterruptHandler(): void {
  if (installed) return;
  installed = true;
  process.on("SIGINT", () => {
    // A second Ctrl+C does not wait for a cleanup that may itself be stuck.
    if (requested) process.exit(130);
    requested = true;
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // Whatever the listener was cancelling reports through the next checkpoint.
      }
    }
  });
}

/** Something that must stop immediately when the person interrupts: a lock still being waited for. */
export function onInterrupt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const interruptRequested = (): boolean => requested;

export function throwIfInterrupted(): void {
  if (requested) throw new InterruptError("interrupted");
}

/**
 * A child killed by SIGINT means the person interrupted us, not that the command failed. Some
 * children (git, a shell script) handle the signal and exit the way a shell reports it, 130, so the
 * status counts too — the parent cannot always see the signal itself.
 */
export function interruptedChild(result: {
  signal: NodeJS.Signals | null;
  status: number | null;
}): boolean {
  return result.signal === "SIGINT" || result.status === 130;
}

/**
 * Let a queued signal callback run, then fail if the person interrupted. Node runs signal callbacks
 * only when the event loop turns, so a synchronous phase that just ended (a copy, a build) has to
 * yield once before its checkpoint can trust the flag.
 */
export async function settleAndThrowIfInterrupted(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  throwIfInterrupted();
}

/** The specs emit a signal in-process; the CLI installs the handler once and never clears it. */
export function clearInterruptForTests(): void {
  requested = false;
}
