/**
 * Media publication, the same for every recorder: a run is staged in a folder of its own and moved
 * into the package's folder only when it came out whole.
 *
 * - `publish` replaces only what its recorder wrote (`mine`), so the other recorder's files in a
 *   shared package folder stay. It is one pass of removals and copies, without rollback: a copy that
 *   fails leaves what it had reached, and the stage beside it for inspection.
 * - `retainFailure` keeps a failed run's stage — the pictures a broken step left, the screenshots a
 *   capture could not make — and names it, so a maintainer inspects the failure instead of
 *   replaying it. A full run folder stays `--keep`'s.
 * - `photograph` takes the first capture of a screen: pictures that are still undrawn fail it rather
 *   than being given a window of their own, so the recording exposes the problem.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Moves `stage` into `dest`, after removing the folder's files that `mine` says are this recorder's. */
export function publish(dest: string, stage: string, mine: (file: string) => boolean) {
  mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(dest))
    if (mine(f)) rmSync(join(dest, f), { recursive: true, force: true });
  const copy = (from: string, to: string) => {
    mkdirSync(to, { recursive: true });
    for (const e of readdirSync(from, { withFileTypes: true })) {
      if (e.isDirectory()) copy(join(from, e.name), join(to, e.name));
      else copyFileSync(join(from, e.name), join(to, e.name));
    }
  };
  copy(stage, dest);
  rmSync(stage, { recursive: true, force: true });
}

/**
 * Keeps a failed run's `stage`, says where it is, and returns the error that fails the recording;
 * a full run folder stays `--keep`'s.
 */
export function retainFailure(stage: string, why?: string): Error {
  const kept = `kept this run's staging folder: ${stage}`;
  console.error(kept);
  return new Error(why ? `${why}; ${kept}` : kept);
}

/**
 * What photographing a screen needs: its picture, how many of its pictures are still undrawn, and
 * how to let go of it.
 */
export type Photo = {
  shot: (file: string) => Promise<unknown>;
  undrawn: () => Promise<number>;
  close: () => void;
};

/**
 * Photographs a screen once, through the session `open` hands back: the first capture is the one
 * the recording keeps, so pictures that are still undrawn fail it instead of another window's try.
 */
export async function photograph(open: () => Promise<Photo>, file: string): Promise<void> {
  const photo = await open();
  try {
    await photo.shot(file);
    const left = await photo.undrawn();
    if (left > 0) throw new Error(`${left} picture(s) of the panel not drawn`);
  } finally {
    photo.close();
  }
}
