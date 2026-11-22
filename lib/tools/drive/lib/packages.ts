/**
 * The packages with scenarios to drive: each app (`apps/<name>`, scenarios in `src/e2e/`), and each
 * kit component and the catalogue (`lib/kits/<name>`, scenarios in `e2e/`). A package is named for
 * its folder, kit packages `kit-<name>`; the name is the `plugin` of its scenario sets and what a
 * verb takes to pick it.
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

export type E2EPackage = {
  /** `answer`, `kit-buttons`. */
  name: string;
  /** The package's folder. */
  dir: string;
  /** Where its `<harness>.scenarios.ts` files, fixtures and `__snapshots__` are. */
  e2e: string;
};

const dirs = (root: string): string[] =>
  existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
        .map((e) => e.name)
        .sort()
    : [];

/** Every package with an e2e folder: apps first, then the kit's. */
export function e2ePackages(): E2EPackage[] {
  const out: E2EPackage[] = [];
  for (const name of dirs(join(repoRoot, "apps"))) {
    const dir = join(repoRoot, "apps", name);
    if (existsSync(join(dir, "src", "e2e"))) out.push({ name, dir, e2e: join(dir, "src", "e2e") });
  }
  for (const name of dirs(join(repoRoot, "lib", "kits"))) {
    const dir = join(repoRoot, "lib", "kits", name);
    if (existsSync(join(dir, "e2e"))) out.push({ name: `kit-${name}`, dir, e2e: join(dir, "e2e") });
  }
  return out;
}

/** The package named `name`, or undefined. */
export const e2ePackage = (name: string): E2EPackage | undefined =>
  e2ePackages().find((p) => p.name === name);

/** The package whose folder `cwd` is, if any. */
export const e2ePackageAt = (cwd: string): E2EPackage | undefined =>
  e2ePackages().find((p) => p.dir === cwd);

/** Where an app's mod and pi extension are built to: `dist/`, which `pnpm turbo run build` writes. */
export const distOf = (name: string): string => join(repoRoot, "apps", name, "dist");
