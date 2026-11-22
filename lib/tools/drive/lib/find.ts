/**
 * Which package and scenario a verb means. A package is an app (`docfix`) or a kit component
 * (`kit-card`); `kit` is every kit package and `apps` every app. Its scenarios are in
 * `<harness>.scenarios.ts` files of its e2e folder, one per harness.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { e2ePackages, type E2EPackage } from "./packages.ts";

/** Where a scenario is shown: two terminal agents, the Claude extension in VS Code, Claude Desktop. */
export type Kind = "claude" | "pi" | "vscode" | "desktop";
export const KINDS: Kind[] = ["claude", "pi", "vscode", "desktop"];
export const isKind = (s: string): s is Kind => (KINDS as string[]).includes(s);

export type Entry = { package: string; harness: Kind; file: string };

/** The packages a name stands for: itself, or all kit packages (`kit`), or all apps (`apps`). */
export function packagesNamed(name?: string): E2EPackage[] {
  const all = e2ePackages();
  if (!name) return all;
  const hit = all.filter(
    (p) =>
      p.name === name ||
      (name === "kit" && p.name.startsWith("kit-")) ||
      (name === "apps" && !p.name.startsWith("kit-")),
  );
  if (hit.length === 0)
    throw new Error(
      `no package ${name} with scenarios; \`ls\` lists them: ${all.map((p) => p.name).join(", ")}`,
    );
  return hit;
}

/** Every `<harness>.scenarios.ts` of the packages `name` stands for, or of all. */
export function entries(name?: string, harnesses: readonly Kind[] = KINDS): Entry[] {
  const out: Entry[] = [];
  for (const p of packagesNamed(name))
    for (const harness of harnesses) {
      const file = join(p.e2e, `${harness}.scenarios.ts`);
      if (existsSync(file)) out.push({ package: p.name, harness, file });
    }
  return out;
}

/** A scenario file's default export: every harness's set has `scenarios` and a `plugin`. */
export type AnySet = {
  plugin: string;
  harness: Kind;
  scenarios: Record<string, { about?: string }>;
};

export async function loadAny(file: string): Promise<AnySet> {
  return ((await import(pathToFileURL(file).href)) as { default: AnySet }).default;
}

/** The file of `pkg` that has `scenario`, in `harness` if given; throws when there is none or several. */
export async function findOwner(pkg: string, scenario: string, harness?: Kind): Promise<Entry> {
  const packages = packagesNamed(pkg);
  if (packages.length !== 1) throw new Error(`${pkg} is several packages: name one of them`);
  const found = entries(pkg).filter((e) => !harness || e.harness === harness);
  const owners: Entry[] = [];
  for (const e of found) if ((await loadAny(e.file)).scenarios[scenario]) owners.push(e);
  if (owners.length === 0)
    throw new Error(
      `no scenario ${pkg} ${scenario}${harness ? ` in ${harness}` : ""}; try \`ls ${pkg}\``,
    );
  if (owners.length > 1)
    throw new Error(
      `${pkg} ${scenario} exists in ${owners.map((o) => o.harness).join(" and ")}: pass --harness`,
    );
  return owners[0]!;
}
