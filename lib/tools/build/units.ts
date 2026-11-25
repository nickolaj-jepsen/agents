// The units that carry a version: a plugin (`apps/<name>` with a Claude or pi half) and a skill
// (`skills/<name>/SKILL.md`). Shared by `pnpm release`, the release plan and the specs.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { frontmatter } from "./frontmatter.ts";
import { isSemver } from "./version.ts";

export type Unit = {
  name: string;
  kind: "plugin" | "skill";
  /** The folder in the repo, `apps/<name>` or `skills/<name>`. */
  folder: string;
  /** The file that carries the version, relative to the root. */
  file: string;
  version: string;
  /** Its changelog, relative to the root. */
  changelog: string;
  /** False for a plugin whose package.json sets `"private": true`: built and run, on no list. */
  released: boolean;
};

const dirs = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];

function semver(file: string, value: unknown, field: string): string {
  if (!isSemver(value)) throw new Error(`${file}: ${field} must be a semver version`);
  return value;
}

function pluginUnit(root: string, name: string): Unit | undefined {
  const file = `apps/${name}/package.json`;
  if (!existsSync(join(root, file))) return undefined;
  let pkg: { version?: unknown; claude?: unknown; pi?: unknown; private?: unknown };
  try {
    pkg = JSON.parse(readFileSync(join(root, file), "utf8")) as typeof pkg;
  } catch (e) {
    throw new Error(`${file}: not JSON: ${(e as Error).message}`);
  }
  // An app that is neither (the site) is not a plugin.
  if (!pkg.claude && !pkg.pi) return undefined;
  return {
    name,
    kind: "plugin",
    folder: `apps/${name}`,
    file,
    version: semver(file, pkg.version, "`version`"),
    changelog: `apps/${name}/CHANGELOG.md`,
    released: pkg.private !== true,
  };
}

function skillUnit(root: string, name: string): Unit | undefined {
  const file = `skills/${name}/SKILL.md`;
  if (!existsSync(join(root, file))) return undefined;
  const metadata = frontmatter(file, readFileSync(join(root, file), "utf8")).data.metadata;
  const value = metadata && typeof metadata === "object" ? metadata.version : undefined;
  return {
    name,
    kind: "skill",
    folder: `skills/${name}`,
    file,
    version: semver(file, value, "`metadata.version`"),
    changelog: `skills/${name}/CHANGELOG.md`,
    released: true,
  };
}

/** The plugin or skill `<name>`, with the version it carries now. */
export const findUnit = (root: string, name: string): Unit | undefined =>
  pluginUnit(root, name) ?? skillUnit(root, name);

/**
 * Every unit a release can publish: the plugins that are not private, then the skills under
 * `skills/`. An unreleased skill sits under `unreleased/skills/`, which nothing here reads. A name
 * that is both a plugin and a skill is listed twice, for the plan to refuse.
 */
export function releasedUnits(root: string): Unit[] {
  const plugins = dirs(join(root, "apps")).flatMap((name) => pluginUnit(root, name) ?? []);
  const skills = dirs(join(root, "skills")).flatMap((name) => skillUnit(root, name) ?? []);
  return [...plugins.filter((unit) => unit.released), ...skills];
}

/** Writes a unit's version where it keeps it, leaving every other byte of the file as it was. */
export function writeVersion(root: string, unit: Unit, version: string): void {
  const file = join(root, unit.file);
  const text = readFileSync(file, "utf8");
  let next: string;
  if (unit.kind === "plugin") {
    // The top-level key: two spaces deep, before any nested object's own `version`.
    next = text.replace(/^( {2}"version":\s*)"[^"]*"/m, `$1"${version}"`);
  } else {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) throw new Error(`${unit.file}: no frontmatter`);
    const front = (m[1] as string).replace(
      /^(metadata:\s*\n(?:[ \t]+.*\n)*?[ \t]+version:[ \t]*).*$/m,
      `$1${version}`,
    );
    next = text.replace(m[1] as string, () => front);
  }
  if (next === text) throw new Error(`${unit.file}: found no version to rewrite`);
  writeFileSync(file, next);
  const written = unit.kind === "plugin" ? pluginUnit(root, unit.name) : skillUnit(root, unit.name);
  if (written?.version !== version)
    throw new Error(`${unit.file}: the version did not read back as ${version}`);
}
