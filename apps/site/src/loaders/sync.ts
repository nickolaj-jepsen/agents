/**
 * What the two loaders share: put a set of entries into a collection's store, skipping the ones
 * whose digest is unchanged, and (in `astro dev`) read again when a source file changes.
 */
import { resolve } from "node:path";
import type { LoaderContext } from "astro/loaders";

type Ctx = Pick<LoaderContext, "store" | "generateDigest" | "logger" | "watcher">;

/** Where an entry stands in its collection's source order, which the store does not keep: pages sort by it. */
export type Positioned = { position: number };

/** Brings the store to exactly `entries` (in order: each gets its `position`), leaving those whose digest is unchanged. */
export function put(ctx: Ctx, entries: Map<string, Record<string, unknown>>): void {
  const { store, generateDigest } = ctx;
  for (const id of store.keys()) if (!entries.has(id)) store.delete(id);
  [...entries].forEach(([id, entry], position) => {
    const data = { ...entry, position };
    // `set` leaves an entry alone whose id and digest are already there.
    store.set({ id, data, digest: generateDigest(data) });
  });
}

/**
 * Reads once, and in dev reads again when a file under `dirs` that `relevant` accepts is added,
 * changed or removed. A failed reload (a README mid-edit) is logged and leaves the entries as they
 * were; a failed first read fails the build.
 */
export async function readAndWatch(
  ctx: Ctx,
  options: { dirs: string[]; relevant: (file: string) => boolean; read: () => Promise<void> },
): Promise<void> {
  await options.read();
  const { watcher, logger } = ctx;
  if (!watcher) return;
  const dirs = options.dirs.map((d) => resolve(d));
  watcher.add(dirs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = (path: string) => {
    const file = resolve(path);
    if (!dirs.some((d) => file === d || file.startsWith(d + "/")) || !options.relevant(file))
      return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      options
        .read()
        .catch((e: unknown) => logger.error(e instanceof Error ? e.message : String(e)));
    }, 60);
  };
  for (const event of ["add", "change", "unlink"] as const) watcher.on(event, changed);
}
