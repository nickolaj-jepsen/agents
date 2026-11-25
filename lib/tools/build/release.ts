/**
 * `pnpm release <name> <patch|minor|major|x.y.z> [--dry-run]` and `pnpm release --status`.
 *
 * A release is a version bump merged to main: CI publishes a unit whose version differs from the
 * one `dist` holds (see plan.ts). This command makes the bump. It writes the new version into
 * `apps/<name>/package.json` or `skills/<name>/SKILL.md`, turns the unit's `## [Unreleased]`
 * changelog section into `## [<version>] - <date>` under a new empty one, and commits both as
 * `release(<name>): <version>`. It tags nothing and pushes nothing: CI tags what it publishes.
 *
 * It refuses an unknown unit, a dirty tree, a version that is not three numbers or does not go up,
 * and an `[Unreleased]` section with no line in it. Both edits can be made by hand as well; the gate
 * checks the result, not how it was made.
 *
 * `--dry-run` prints the version and the section and writes nothing.
 *
 * `--status [--remote origin] [--summary <file>]` is a report, never a gate: a change may wait on
 * main for as long as its unit's version stays put. It lists each released unit that has lines under
 * `[Unreleased]`, whose version differs from dist's (it publishes on merge), or whose content
 * differs from what dist holds at the same version: for a skill its folder, for a plugin its build
 * in `apps/<name>/dist`, so a change to a kit or a dependency shows up too.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UNRELEASED, cutRelease, notesOf, sectionOf } from "./changelog.ts";
import {
  type Ledger,
  buildFiles,
  distFolder,
  readLedger,
  sameTree,
  skillFiles,
  treeAt,
  treeOf,
} from "./dist.ts";
import * as git from "./git.ts";
import { fetchState } from "./plan.ts";
import { type Unit, findUnit, releasedUnits, writeVersion } from "./units.ts";
import { LEVELS, type Level, type Tier, bump, compareSemver, isPlain, tierOf } from "./version.ts";

export type ReleaseOptions = {
  /** Print what would be written instead of writing it. */
  dryRun?: boolean;
  /** The changelog's date, `YYYY-MM-DD`; today when omitted. */
  date?: string;
};

export type ReleaseResult = {
  unit: Unit;
  /** The version before the bump. */
  from: string;
  version: string;
  tier: Tier;
  /** The lines the release ships: the bullets that were under `[Unreleased]`. */
  notes: string[];
  dryRun: boolean;
  /** The lines the command prints. */
  text: string;
};

/** Bumps a plugin or skill to `to` (a level or a version) and commits the release. */
export function release(
  root: string,
  name: string,
  to: string,
  options: ReleaseOptions = {},
): ReleaseResult {
  const unit = findUnit(root, name);
  if (!unit)
    throw new Error(`unknown unit \`${name}\`: no apps/${name} plugin or skills/${name} skill`);

  const dirty = git.status(root);
  if (dirty.length > 0)
    throw new Error(
      `the tree is dirty; commit these changes first:\n${dirty.map((line) => `  ${line}`).join("\n")}`,
    );

  const version = (LEVELS as readonly string[]).includes(to) ? bump(unit.version, to as Level) : to;
  if (!isPlain(version))
    throw new Error(
      `\`${to}\` is no version: name a level (${LEVELS.join(", ")}) or three numbers such as 0.3.0`,
    );
  if (compareSemver(version, unit.version) <= 0)
    throw new Error(`${version} does not go up from ${unit.version}`);

  const file = join(root, unit.changelog);
  if (!existsSync(file))
    throw new Error(`${unit.changelog} is missing: start it with \`## [${UNRELEASED}]\``);
  const before = readFileSync(file, "utf8");
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const after = cutRelease(before, version, date);
  const notes = notesOf(sectionOf(after, version));
  const dryRun = options.dryRun === true;

  if (!dryRun) {
    writeFileSync(file, after);
    writeVersion(root, unit, version);
    git.commitPaths(root, `release(${name}): ${version}`, [unit.changelog, unit.file]);
  }

  const tier = tierOf(version);
  const text = [
    `${name} ${unit.version} → ${version} (${tier})`,
    "",
    `## [${version}] - ${date}`,
    "",
    ...notes,
    "",
    dryRun
      ? "dry run: nothing written"
      : `committed release(${name}): ${version}; merging it to main publishes it`,
  ].join("\n");

  return { unit, from: unit.version, version, tier, notes, dryRun, text };
}

export type StatusRow = {
  name: string;
  kind: "plugin" | "skill";
  version: string;
  /** Lines under `[Unreleased]`. */
  notes: number;
  /** The version dist holds, when dist was read and holds the unit. */
  published?: string;
  /** Its version differs from dist's, or dist does not hold it: a merge to main publishes it. */
  publishes: boolean;
  /**
   * At dist's version, whether its content differs from what dist holds. Undefined when that cannot
   * be told: dist was not read, or a plugin has no build in `apps/<name>/dist`.
   */
  differs?: boolean;
};

/** A unit's content as dist would hold it, or undefined for a plugin that is not built. */
function contentOf(root: string, unit: Unit) {
  if (unit.kind === "skill") return treeOf(join(root, unit.folder), skillFiles(root, unit.folder));
  const dir = join(root, unit.folder, "dist");
  return existsSync(dir) ? treeOf(dir, buildFiles(dir)) : undefined;
}

/**
 * The released units with something waiting: unreleased notes, a version dist does not hold, or
 * content that differs from dist's at the same version. `ref` names a commit of dist; without it
 * (or without a ledger there) only the notes are reported.
 */
export function status(root: string, ref?: string): StatusRow[] {
  const ledger: Ledger | undefined = ref ? readLedger(root, ref) : undefined;
  return releasedUnits(root)
    .flatMap((unit): StatusRow[] => {
      const file = join(root, unit.changelog);
      const notes = existsSync(file)
        ? notesOf(sectionOf(readFileSync(file, "utf8"), UNRELEASED)).length
        : 0;
      const held = ledger?.[unit.name];
      const publishes = ledger !== undefined && held?.version !== unit.version;
      let differs: boolean | undefined;
      if (ref && held && !publishes) {
        const content = contentOf(root, unit);
        if (content) differs = !sameTree(content, treeAt(root, ref, distFolder(unit)));
      }
      if (notes === 0 && !publishes && differs !== true) return [];
      return [
        {
          name: unit.name,
          kind: unit.kind,
          version: unit.version,
          notes,
          ...(held ? { published: held.version } : {}),
          publishes,
          ...(differs === undefined ? {} : { differs }),
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The lines `--status` prints: one per unit with something waiting, none when there is nothing. */
export function renderStatus(rows: StatusRow[]): string[] {
  return rows.map((row) => {
    const parts: string[] = [];
    if (row.publishes)
      parts.push(
        row.published
          ? `publishes on merge (dist has ${row.published})`
          : "publishes on merge (new on dist)",
      );
    if (row.differs)
      parts.push(
        row.kind === "plugin" ? "its build differs from dist" : "its folder differs from dist",
      );
    if (row.notes > 0) parts.push(`${row.notes} unreleased ${row.notes === 1 ? "note" : "notes"}`);
    return `${row.name} ${row.version}: ${parts.join("; ")}`;
  });
}

function main(): void {
  const args = process.argv.slice(2);
  const option = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const root = git.rootOf();
  if (args.includes("--status")) {
    let ref: string | undefined;
    try {
      // Fetches dist's tip, which the report compares against.
      if (fetchState(root, option("--remote") ?? "origin").ledger) ref = "FETCH_HEAD";
      else console.error("release: dist holds no releases.json; reporting unreleased notes only");
    } catch (e) {
      console.error(`release: could not read dist (${(e as Error).message.split("\n")[0]})`);
    }
    const lines = renderStatus(status(root, ref));
    if (lines.length > 0) console.log(lines.join("\n"));
    const summary = option("--summary");
    if (summary)
      appendFileSync(
        summary,
        lines.length > 0
          ? `## Waiting on main\n\nNot a failure: these change when their version is bumped.\n\n${lines.map((line) => `- ${line}`).join("\n")}\n`
          : "## Waiting on main\n\nNothing: every unit matches what dist holds.\n",
      );
    return;
  }
  const positional = args.filter((arg) => !arg.startsWith("-"));
  const [name, to] = positional;
  if (!name || !to) {
    console.error(
      `release: usage: pnpm release <name> <${LEVELS.join("|")}|x.y.z> [--dry-run], or pnpm release --status`,
    );
    process.exit(1);
  }
  try {
    console.log(release(root, name, to, { dryRun: args.includes("--dry-run") }).text);
  } catch (e) {
    console.error(`release: ${(e as Error).message}`);
    process.exit(1);
  }
}

if (import.meta.main) main();
