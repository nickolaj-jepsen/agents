/**
 * What a Claude Code mod carries of the kit, and where: the engine cannot import outside a
 * mod's folder, so every mod holds verbatim copies, written by `just kit-sync` and checked by
 * `kit/legacy/claude/ui.spec.ts`.
 *
 * - The kit (`kit/`, less what only pi or the repo's tooling reads) goes to `claude/kit/`. A
 *   mod is on the list by having that folder; `just kit-sync <plugin>` gives it one.
 * - The legacy kit (`kit/legacy/claude/ui.tsx`) and its test assertions go to `claude/ui.tsx`
 *   and `claude/checks.tsx`. A mod is on that list by still having a `ui.tsx`; none is added.
 * - The catalogue mod is not a plugin: it always has both, and the catalogue's samples.
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, "..");
const legacy = join(here, "legacy/claude/ui.tsx");
/** The legacy kit's graphical-style assertions, for a mod's tests. */
const checks = join(here, "legacy/claude/checks.tsx");
const catalogue = join(root, "kit/catalog/claude/claude");

/** Folders of `kit/` that are not the kit a mod draws with. */
const apart = new Set(["legacy", "catalog"]);

/**
 * The kit's files a mod carries, relative to `kit/`: every `.ts` and `.tsx` but tests, pi's
 * painter and this tooling. Stories go to the catalogue mod alone.
 */
export function kitFiles(withStories: boolean): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return dir === here && apart.has(entry.name) ? [] : walk(path);
      return /\.tsx?$/.test(entry.name) ? [relative(here, path)] : [];
    });
  return walk(here)
    .filter(
      (file) =>
        !file.endsWith(".spec.ts") &&
        !/(^|\/)pi\.ts$/.test(file) &&
        !["copies.ts", "sync.ts", "parity.ts", "new.ts"].includes(file) &&
        (withStories || !file.endsWith("stories.ts")),
    )
    .sort();
}

const mods = () =>
  readdirSync(join(root, "plugins"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(root, "plugins", d.name, "claude"));

/** Every folder that holds a copy of the kit, plus those of `add` (plugin names). */
export function kitCopies(add: string[] = []): string[] {
  const found = mods()
    .map((dir) => join(dir, "kit"))
    .filter((dir) => existsSync(dir));
  const added = add.map((name) => join(root, "plugins", name, "claude/kit"));
  return [...new Set([...found, ...added, join(catalogue, "kit")])].sort();
}

/** Every file that must equal its source. */
export function pairs(add: string[] = []): { source: string; file: string }[] {
  const legacyCopies = mods()
    .map((dir) => join(dir, "ui.tsx"))
    .filter((file) => existsSync(file));
  return [
    ...[...legacyCopies, join(catalogue, "ui.tsx")].map((file) => ({ source: legacy, file })),
    ...legacyCopies.map((file) => ({ source: checks, file: join(dirname(file), "checks.tsx") })),
    { source: join(root, "kit/catalog/samples.ts"), file: join(catalogue, "samples.ts") },
    ...kitCopies(add).flatMap((dir) =>
      kitFiles(dir.startsWith(catalogue)).map((path) => ({
        source: join(here, path),
        file: join(dir, path),
      })),
    ),
  ];
}

/** Files in a copy of the kit that the kit no longer has: a renamed or removed source. */
export function strays(add: string[] = []): string[] {
  const walk = (dir: string): string[] =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
          entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
        )
      : [];
  return kitCopies(add).flatMap((dir) => {
    const wanted = new Set(kitFiles(dir.startsWith(catalogue)).map((path) => join(dir, path)));
    return walk(dir).filter((file) => !wanted.has(file));
  });
}
