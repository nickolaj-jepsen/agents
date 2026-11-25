// What the `dist` branch holds, and what a unit would put there. `dist` is the record of what is
// released: one folder per plugin, `skills/<name>/` per skill, and `releases.json`, which names each
// unit's version. No imports beyond node and `git.ts`, so the publish script runs it with plain node.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./git.ts";
import { versionOf } from "./version.ts";

export const DIST_BRANCH = "dist";
export const LEDGER_FILE = "releases.json";

export type Kind = "plugin" | "skill" | "bundle";

export type Released = {
  kind: Kind;
  version: string;
  /** The commit of main it was built from. */
  source: string;
  /** The day it was published, `YYYY-MM-DD`. */
  date: string;
};
/** `releases.json` on dist: every released unit by name. */
export type Ledger = Record<string, Released>;

/** Where a unit's folder is on dist: `<name>/`, `skills/<name>/` or `bundles/<name>/`. */
export const distFolder = (unit: { name: string; kind: Kind }): string =>
  unit.kind === "plugin" ? unit.name : `${unit.kind}s/${unit.name}`;

/**
 * The ledger at a ref, or undefined when the ref holds none: no `dist` branch yet, or one from
 * before releases were gated, which the first gated publish replaces whole.
 */
export function readLedger(root: string, ref: string): Ledger | undefined {
  let text: string;
  try {
    text = git(root, ["show", `${ref}:${LEDGER_FILE}`]);
  } catch {
    return undefined;
  }
  return JSON.parse(text) as Ledger;
}

export const renderLedger = (ledger: Ledger): string =>
  JSON.stringify(
    Object.fromEntries(Object.entries(ledger).sort(([a], [b]) => a.localeCompare(b))),
    null,
    2,
  ) + "\n";

/** A folder's files by path, each with the hash git gives its content. */
export type Tree = Map<string, string>;

const blobHash = (content: Buffer): string =>
  createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");

/** The files under a folder of a ref. Empty when the ref or the folder is not there. */
export function treeAt(root: string, ref: string, folder: string): Tree {
  let out: string;
  try {
    out = git(root, ["ls-tree", "-r", "-z", ref, "--", `${folder}/`]);
  } catch {
    return new Map();
  }
  const tree: Tree = new Map();
  for (const entry of out.split("\0")) {
    // `<mode> <type> <hash>\t<path>`
    const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/s.exec(entry);
    if (m) tree.set((m[2] as string).slice(folder.length + 1), m[1] as string);
  }
  return tree;
}

/** The files of a folder on disk, as `paths` lists them relative to it. */
export function treeOf(dir: string, paths: string[]): Tree {
  return new Map(paths.map((path) => [path, blobHash(readFileSync(join(dir, path)))]));
}

export function sameTree(a: Tree, b: Tree): boolean {
  if (a.size !== b.size) return false;
  for (const [path, hash] of a) if (b.get(path) !== hash) return false;
  return true;
}

/** Every file under a folder, relative to it. */
export function filesUnder(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? filesUnder(join(dir, e.name), base)
        : [join(dir, e.name).slice(base.length + 1)],
    )
    .sort();
}

/**
 * The files a skill publishes: what git tracks in its folder, less its changelog. The skills CLI
 * copies a skill's whole folder to the person who installs it, so the changelog stays on main and
 * its notes go into the GitHub Release.
 */
export function skillFiles(root: string, folder: string): string[] {
  return git(root, ["ls-files", "-z", "--", `${folder}/`])
    .split("\0")
    .filter((path) => path !== "")
    .map((path) => path.slice(folder.length + 1))
    .filter((path) => path !== "CHANGELOG.md")
    .sort();
}

/**
 * The files of a plugin's build, less what the mod engine lays beside it when it loads a mod from
 * `apps/<name>/dist`: the API types and their tsconfig. A nix build has neither.
 */
export function buildFiles(dir: string): string[] {
  return filesUnder(dir).filter(
    (path) => path !== "tsconfig.json" && !path.startsWith(".claude-plugin/types/"),
  );
}

/**
 * The version of the `skills` plugin on dist: a digest of the released skills and their versions,
 * so Claude Code offers an update when a skill was released and at no other time. Without a version
 * it would use dist's commit, which every plugin release moves.
 */
export const skillsVersion = (ledger: Ledger): string =>
  versionOf(
    Object.entries(ledger)
      .filter(([, unit]) => unit.kind === "skill")
      .map(([name, unit]) => ({ name, version: unit.version })),
  );
