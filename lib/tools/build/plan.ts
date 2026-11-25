/**
 * `node plan.ts [--remote origin] [--json <file>] [--summary <file>]`: what a push of this commit to
 * main releases.
 *
 * A unit (a plugin, or a skill) is released when its version here differs from the one `dist`
 * records for it in `releases.json`: a merged version bump is the whole release. The plan compares
 * against `dist`, not against the push, so a publish that failed is planned again by the next run.
 *
 * - new on dist, or a higher version: published
 * - the same version: left alone, whatever changed in its folder
 * - on dist and no longer a released unit here: retired, its folder removed
 * - a bundle (bundles.ts) whose version, made from its skills', differs from dist's: published,
 *   with no tag or GitHub Release of its own
 * - a lower version, a suffixed one (`1.3.0-rc.1`), a tag that already exists, a name that is both
 *   a plugin and a skill, or no changelog section for the version: the plan fails
 *
 * A `dist` with no `releases.json` is from before releases were gated (or is not there yet). That
 * one run publishes every unit and compares nothing: the cutover.
 *
 * `--json` writes the plan for `publish.ts`; `--summary` appends it as markdown, which CI shows on
 * the run. Exits 1 when the plan has problems.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { notesOf, sectionOf } from "./changelog.ts";
import { checkUses, membersOf, readBundles, readSkillFacts } from "./bundles.ts";
import { DIST_BRANCH, type Kind, type Ledger, readLedger } from "./dist.ts";
import { git, rootOf } from "./git.ts";
import { releasedUnits, type Unit } from "./units.ts";
import { compareSemver, isPlain, isPrerelease, tagName, type Tier, tierOf } from "./version.ts";

export type PlannedUnit = {
  name: string;
  kind: "plugin" | "skill";
  /** The folder in the repo, `apps/<name>` or `skills/<name>`. */
  folder: string;
  version: string;
  /** The version dist holds now; absent for a unit dist has never held. */
  from?: string;
  tier: Tier;
  /** What its GitHub Release is flagged as. */
  prerelease: boolean;
  tag: string;
  /** The changelog section of this version: the body of its GitHub Release. */
  notes: string;
};

export type PlannedBundle = {
  name: string;
  title: string;
  tagline: string;
  version: string;
  /** The version dist holds now; absent for a bundle dist has never held. */
  from?: string;
  /** Every skill it installs, in name order. */
  skills: string[];
};

export type Plan = {
  /** dist has no ledger yet: this run publishes every unit and makes no GitHub Release. */
  cutover: boolean;
  publish: PlannedUnit[];
  /** The bundles to write again: published after the skills, from the skills dist then holds. */
  bundles: PlannedBundle[];
  retire: { name: string; kind: Kind; version: string }[];
  /** Released units whose version dist already holds. */
  unchanged: number;
  problems: string[];
};

/** The plan for the units of `root`, against a ledger and the tags that already exist. */
export function planRelease(
  root: string,
  ledger: Ledger | undefined,
  tags: ReadonlySet<string> = new Set(),
): Plan {
  const units = releasedUnits(root);
  const problems: string[] = [];
  const publish: PlannedUnit[] = [];
  let unchanged = 0;

  const seen = new Map<string, Unit>();
  for (const unit of units) {
    const other = seen.get(unit.name);
    if (other)
      problems.push(
        `${unit.name}: is both ${other.folder} and ${unit.folder}; a plugin and a skill share one set of names, since each is tagged \`<name>--v<version>\``,
      );
    seen.set(unit.name, unit);
  }

  for (const unit of units) {
    if (!isPlain(unit.version)) {
      problems.push(
        `${unit.name}: ${unit.version} has a suffix; there is one channel, so a version is three numbers`,
      );
      continue;
    }
    const held = ledger?.[unit.name];
    if (ledger && held) {
      const order = compareSemver(unit.version, held.version);
      if (order === 0 && held.kind === unit.kind) {
        unchanged++;
        continue;
      }
      if (order < 0) {
        problems.push(
          `${unit.name}: ${unit.version} is lower than the ${held.version} on ${DIST_BRANCH}; a version only goes up`,
        );
        continue;
      }
      if (order === 0) {
        problems.push(
          `${unit.name}: was released as a ${held.kind} at ${held.version}; bump it to release it as a ${unit.kind}`,
        );
        continue;
      }
    }
    const tag = tagName(unit.name, unit.version);
    if (tags.has(tag))
      problems.push(
        `${unit.name}: the tag ${tag} already exists; a version is published once, so bump it`,
      );
    const file = join(root, unit.changelog);
    const section = existsSync(file)
      ? sectionOf(readFileSync(file, "utf8"), unit.version)
      : undefined;
    if (notesOf(section).length === 0)
      problems.push(
        `${unit.name}: ${unit.changelog} has no \`## [${unit.version}]\` section with a \`- \` line; \`pnpm release ${unit.name} <level>\` writes it from \`[Unreleased]\``,
      );
    publish.push({
      name: unit.name,
      kind: unit.kind,
      folder: unit.folder,
      version: unit.version,
      ...(held ? { from: held.version } : {}),
      tier: tierOf(unit.version),
      prerelease: isPrerelease(unit.version),
      tag,
      notes: section?.body ?? "",
    });
  }

  const skills = readSkillFacts(root);
  const resolved = readBundles(root, skills);
  problems.push(...checkUses(skills), ...resolved.problems);
  const bundles: PlannedBundle[] = [];
  for (const bundle of resolved.bundles) {
    if (seen.has(bundle.name)) {
      problems.push(
        `bundles/${bundle.name}: \`${bundle.name}\` is ${seen.get(bundle.name)!.folder} too; a bundle needs a name of its own`,
      );
      continue;
    }
    const held = ledger?.[bundle.name];
    if (held?.kind === "bundle" && held.version === bundle.version) continue;
    bundles.push({
      name: bundle.name,
      title: bundle.title,
      tagline: bundle.tagline,
      version: bundle.version,
      ...(held ? { from: held.version } : {}),
      skills: membersOf(bundle),
    });
  }

  const names = new Set([...units, ...resolved.bundles].map((unit) => unit.name));
  const retire = Object.entries(ledger ?? {})
    .filter(([name]) => !names.has(name))
    .map(([name, held]) => ({ name, kind: held.kind, version: held.version }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { cutover: ledger === undefined, publish, bundles, retire, unchanged, problems };
}

/** The plan as markdown: what CI shows on a run, and what a person reads before merging. */
export function renderPlan(plan: Plan): string {
  const lines: string[] = ["## Release plan", ""];
  if (plan.problems.length > 0) {
    lines.push("**The plan fails:**", "", ...plan.problems.map((p) => `- ${p}`), "");
  }
  if (plan.cutover)
    lines.push(
      `\`${DIST_BRANCH}\` has no \`releases.json\` yet, so this is the cutover: every unit is published and tagged, and no GitHub Release is made.`,
      "",
    );
  if (plan.publish.length === 0 && plan.bundles.length === 0 && plan.retire.length === 0) {
    lines.push(`Nothing to release: ${plan.unchanged} units are at the version on \`dist\`.`);
    return lines.join("\n") + "\n";
  }
  if (plan.publish.length > 0) {
    lines.push("| Unit | Kind | Version | Tier |", "| --- | --- | --- | --- |");
    for (const unit of plan.publish)
      lines.push(
        `| ${unit.name} | ${unit.kind} | ${unit.from ? `${unit.from} → ` : ""}${unit.version} | ${unit.tier} |`,
      );
    lines.push("");
  }
  if (plan.bundles.length > 0)
    lines.push(
      `Bundles written again: ${plan.bundles.map((b) => `${b.name} (${b.skills.length} skills)`).join(", ")}.`,
      "",
    );
  if (plan.retire.length > 0)
    lines.push(
      `Removed from \`dist\`: ${plan.retire.map((unit) => `${unit.name} ${unit.version}`).join(", ")}.`,
      "",
    );
  lines.push(`${plan.unchanged} other units stay as they are.`);
  return lines.join("\n") + "\n";
}

/** The remote's `dist` ledger and tags, fetched: what a plan is made against. */
export function fetchState(
  root: string,
  remote: string,
): { ledger: Ledger | undefined; tags: Set<string> } {
  const refs = git(root, ["ls-remote", "--heads", "--tags", remote])
    .split("\n")
    .map((line) => line.split("\t")[1] ?? "");
  const tags = new Set(
    refs
      .filter((ref) => ref.startsWith("refs/tags/"))
      .map((ref) => ref.slice("refs/tags/".length).replace(/\^\{\}$/, "")),
  );
  if (!refs.includes(`refs/heads/${DIST_BRANCH}`)) return { ledger: undefined, tags };
  // Only dist's tip is read. A checkout that is already shallow (CI's) fetches that one commit; a
  // full one must not be handed `--depth`, which would cut the history it has of the branch.
  const shallow = git(root, ["rev-parse", "--is-shallow-repository"]) === "true";
  git(root, [
    "fetch",
    "--quiet",
    ...(shallow ? ["--depth", "1"] : []),
    remote,
    `refs/heads/${DIST_BRANCH}`,
  ]);
  return { ledger: readLedger(root, "FETCH_HEAD"), tags };
}

function main(): void {
  const args = process.argv.slice(2);
  const option = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const root = rootOf();
  const { ledger, tags } = fetchState(root, option("--remote") ?? "origin");
  const plan = planRelease(root, ledger, tags);
  const json = option("--json");
  if (json) writeFileSync(json, JSON.stringify(plan, null, 2) + "\n");
  const text = renderPlan(plan);
  const summary = option("--summary");
  if (summary) appendFileSync(summary, text);
  console.log(text);
  if (plan.problems.length > 0) process.exit(1);
}

if (import.meta.main) main();
