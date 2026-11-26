/**
 * The one transaction behind `update` and `reset`: the state file first, the writable tree second.
 *
 * A publication is only real if what the tree reads and what `resolve` reports agree, so a command
 * that changes the state writes `current.json` first, converges the deployed tree, and — when the
 * tree fails — puts the state file back. That order, the snapshot of the previous bytes it needs, and
 * the undo itself are the same for both callers, so they live here and each command supplies only
 * what its own change is.
 *
 * The undo is the same kind of write as the forward one: a temporary file and one rename, from
 * `writeBytesAtomic`, never a truncating write over a file a launch may be reading. It puts the
 * exact bytes back rather than re-serialising them, and removes the file when there was none, so a
 * first publication that failed leaves no state behind at all.
 *
 * The write is optional: a command whose change touches no state passes no `save`, and a commit that
 * wrote no state has no state to undo — there are no previous bytes to keep, and the deploy stands or
 * falls on its own.
 *
 * When even the undo fails, the failure that caused it is still the one that reaches the caller: a
 * warning names the state file that could not be put back, and the deploy's error is rethrown, so a
 * broken filesystem cannot hide what actually failed.
 */
import fs from "node:fs";
import { describeError } from "./errors.ts";
import { removeFileIfPresent, writeBytesAtomic } from "./json.ts";
import { stateFilePath } from "./paths.ts";
import { STATE_FILE } from "./protocol.ts";

/** The state file as it is now, or null when this run would write the first one. */
function stateBytes(path: string): Buffer | null {
  try {
    return fs.readFileSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Put `previous` back, or drop the file when there was none: the undo of a state write. */
function restoreState(path: string, previous: Buffer | null): void {
  if (previous === null) {
    removeFileIfPresent(path);
    return;
  }
  writeBytesAtomic(path, previous);
}

/** The seam the specs use to fail the state write's undo; production crosses none of them. */
export type CommitIo = {
  /** Put those bytes back, or remove the file when there were none. */
  restore?: (path: string, previous: Buffer | null) => void;
};

export type StateCommit<T> = {
  /** The state directory holding `current.json`. */
  state: string;
  /** Report an undo that failed; it never replaces the failure that caused it. */
  warn: (message: string) => void;
  /** Make this command's change to the state, and say what it was; absent when it changes none. */
  save?: () => void;
  /** Converge the writable tree on the state; its result is what the commit returns. */
  deploy: () => T;
};

export function commitState<T>(commit: StateCommit<T>, io: CommitIo = {}): T {
  // No state write means no state to undo: the command changed nothing in it, so the deploy stands
  // or falls on its own.
  if (commit.save === undefined) return commit.deploy();
  const path = stateFilePath(commit.state);
  const previous = stateBytes(path);
  commit.save();
  try {
    return commit.deploy();
  } catch (error) {
    try {
      (io.restore ?? restoreState)(path, previous);
    } catch (undoError) {
      commit.warn(
        `agents: could not put ${STATE_FILE} back after a failed deploy: ${describeError(undoError)}`,
      );
    }
    throw error;
  }
}
