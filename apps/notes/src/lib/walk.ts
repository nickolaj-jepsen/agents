/**
 * The walk over a store's folders, written once: a harness says how a folder is listed, and this
 * decides which folders are gone into and when to stop.
 */
import { isWalked, type Entry } from "./shelf.ts";

/** One entry of a folder as a harness lists it; a link is `other`, and is not followed. */
export type Listed = { name: string; kind: "file" | "dir" | "other"; mtimeMs: number };

/** Lists a folder by its path; a folder that cannot be read is an empty one. */
export type Lister = (dir: string) => Promise<readonly Listed[]>;

export type WalkLimits = {
  /** Folders below the root a walk goes into. */
  depth: number;
  /** Files after which it stops: a store that large is no list to read. */
  files: number;
};

export const WALK_LIMITS: WalkLimits = { depth: 8, files: 4000 };

/**
 * Every file under `root`, its path below it and when it was written. Folders are taken a level
 * at a time, so a cut walk has the files nearest the root.
 */
export async function walk(
  list: Lister,
  root: string,
  limits: WalkLimits = WALK_LIMITS,
): Promise<Entry[]> {
  const found: Entry[] = [];
  let level = [""];
  for (let depth = 0; depth <= limits.depth && level.length > 0; depth++) {
    const next: string[] = [];
    const listed = await Promise.all(
      level.map(async (below) => ({
        below,
        entries: await list(below ? `${root}/${below}` : root).catch(() => []),
      })),
    );
    for (const { below, entries } of listed) {
      for (const entry of entries) {
        const path = below ? `${below}/${entry.name}` : entry.name;
        if (entry.kind === "dir") {
          if (isWalked(entry.name)) next.push(path);
        } else if (entry.kind === "file") {
          if (found.length >= limits.files) return found;
          found.push({ path, mtimeMs: entry.mtimeMs });
        }
      }
    }
    level = next.sort();
  }
  return found;
}
