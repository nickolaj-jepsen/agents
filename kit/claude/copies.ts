/**
 * Where the Claude kit's single source (`kit/claude/ui.tsx`) is copied to: the engine cannot
 * import outside a mod's folder, so each mod that uses it carries a verbatim `claude/ui.tsx`.
 * A mod is on the list by having one, and gets the kit's test assertions beside it
 * (`claude/checks.tsx`). The catalogue mod also carries the catalogue's sample data, for the same
 * reason.
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, "../..");
export const source = join(here, "ui.tsx");
/** The kit's graphical-style assertions, for a mod's tests. */
export const checks = join(here, "checks.tsx");

/** The catalogue mod is not a plugin, so it is named here and always has a copy. */
const extra = [join(root, "kit/catalog/claude/claude/ui.tsx")];

/** Every copy that exists, plus `add` (plugin names) to be created. */
export function copies(add: string[] = []): string[] {
  const plugins = join(root, "plugins");
  const found = readdirSync(plugins, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(plugins, d.name, "claude/ui.tsx"))
    .filter((f) => existsSync(f));
  const added = add.map((name) => join(plugins, name, "claude/ui.tsx"));
  return [...new Set([...found, ...added, ...extra])].sort();
}

/**
 * Every file that must equal its source: the kit's copies, each plugin's copy of the assertions
 * beside its `ui.tsx`, and the catalogue mod's samples.
 */
export function pairs(add: string[] = []): { source: string; file: string }[] {
  const all = copies(add);
  return [
    ...all.map((file) => ({ source, file })),
    ...all
      .filter((file) => !extra.includes(file))
      .map((file) => ({ source: checks, file: join(dirname(file), "checks.tsx") })),
    {
      source: join(root, "kit/catalog/samples.ts"),
      file: join(root, "kit/catalog/claude/claude/samples.ts"),
    },
  ];
}
