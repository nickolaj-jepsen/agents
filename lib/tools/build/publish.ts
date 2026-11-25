/**
 * `node publish.ts --plan <plan.json> --built <folder> [--result <file>]`: appends one commit to the
 * `dist` branch with what the plan releases, and tags each released version on it.
 *
 * `dist` is what the marketplace, the skills CLI and a pi install read: `<name>/` per plugin (the
 * folder `nix build .#<name>` made, here `<built>/<name>`), `skills/<name>/` per skill (what git
 * tracks in the skill's folder, less its changelog), `skills/.claude-plugin/plugin.json` (the
 * `skills` plugin Claude Code installs) and `releases.json` (each unit's version: the ledger the
 * next plan compares against).
 *
 * Only the planned folders change. A unit whose version did not move keeps the bytes it was
 * released with; a retired one is removed. The branch is created (an orphan) when it is missing and
 * only ever fast-forwarded, and the commit and its `<name>--v<version>` tags are pushed together or
 * not at all. A unit dist already holds at the planned version, or a later one, is skipped, so a
 * run that is repeated after a partial failure publishes nothing twice.
 *
 * The cutover (a dist with no `releases.json`) replaces the whole tree.
 *
 *   DIST_REMOTE   where to push (a URL or folder); default: this checkout's `origin`
 *   DIST_TOKEN    a token to push over https with (CI's GITHUB_TOKEN); default: none
 *   DIST_SOURCE   the commit of main it was built from; default: HEAD here
 *
 * `--result` writes `{ commit, tags, releases }`: `releases` are the GitHub Releases to make, one per
 * published unit with its tag, title, notes and prerelease flag, and none at the cutover.
 *
 * Runs on plain node: no imports beyond node and the files beside it that import nothing else.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  DIST_BRANCH,
  LEDGER_FILE,
  type Ledger,
  distFolder,
  filesUnder,
  readLedger,
  renderLedger,
  skillFiles,
  skillsVersion,
} from "./dist.ts";
import { git, rootOf } from "./git.ts";
import type { Plan, PlannedUnit } from "./plan.ts";
import { compareSemver } from "./version.ts";

export type GithubRelease = {
  tag: string;
  title: string;
  notes: string;
  prerelease: boolean;
};

export type PublishResult = {
  /** The dist commit, or undefined when dist already held everything. */
  commit?: string;
  tags: string[];
  releases: GithubRelease[];
};

export type PublishOptions = {
  /** The checkout of main: where the skills are read from. */
  root: string;
  /** The folder holding one `<name>/` build per planned plugin. */
  built: string;
  remote: string;
  /** The commit of main this was built from. */
  source: string;
  token?: string;
  /** `YYYY-MM-DD`; today when omitted. */
  date?: string;
};

/** The `skills` plugin's manifest on dist: its root is the folder of skill folders. */
const skillsManifest = (ledger: Ledger): string =>
  JSON.stringify(
    {
      name: "skills",
      version: skillsVersion(ledger),
      description: "Agent skills from nickolaj-jepsen/agents",
      author: { name: "Nickolaj Jepsen" },
      skills: "./",
    },
    null,
    2,
  ) + "\n";

/**
 * Copies files as new ones that keep only their executable bit: a build comes out of the nix store
 * read-only, and the scratch clone is deleted afterwards.
 */
function copyFiles(from: string, to: string, files: string[]): void {
  for (const file of files) {
    const target = join(to, file);
    mkdirSync(dirname(target), { recursive: true });
    const executable = (statSync(join(from, file)).mode & 0o111) !== 0;
    writeFileSync(target, readFileSync(join(from, file)), { mode: executable ? 0o755 : 0o644 });
  }
}

/** git for the scratch clone: none of the machine's config or hooks, and CI's identity. */
function scratchEnv(token: string | undefined): NodeJS.ProcessEnv {
  const email = "41898282+github-actions[bot]@users.noreply.github.com";
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_AUTHOR_NAME: "github-actions[bot]",
    GIT_COMMITTER_NAME: "github-actions[bot]",
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_EMAIL: email,
  };
  if (token) {
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader";
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
  }
  return env;
}

/** What the commit is called: the units by name while they fit on a line. */
function subject(plan: Plan, published: PlannedUnit[]): string {
  if (plan.cutover) return `release: start gated releases with ${published.length} units`;
  const parts = [
    ...published.map((unit) => `${unit.name} ${unit.version}`),
    ...plan.retire.map((unit) => `retire ${unit.name}`),
  ];
  const text = `release: ${parts.join(", ")}`;
  return text.length <= 72 ? text : `release: ${parts.length} units`;
}

export function publish(plan: Plan, options: PublishOptions): PublishResult {
  if (plan.problems.length > 0)
    throw new Error(`the plan has problems:\n${plan.problems.map((p) => `  ${p}`).join("\n")}`);
  const built = resolve(options.built);
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const work = mkdtempSync(join(tmpdir(), "agents-publish-"));
  const env = scratchEnv(options.token);
  try {
    const run = (args: string[]) => git(work, args, env);
    run(["init", "--quiet"]);
    run(["config", "core.hooksPath", "/dev/null"]);
    run(["remote", "add", "origin", options.remote]);
    const exists = run(["ls-remote", "--heads", "origin", DIST_BRANCH]) !== "";
    if (exists) {
      run(["fetch", "--quiet", "--depth", "1", "origin", `refs/heads/${DIST_BRANCH}`]);
      run(["checkout", "--quiet", "-B", DIST_BRANCH, "FETCH_HEAD"]);
    } else {
      run(["checkout", "--quiet", "--orphan", DIST_BRANCH]);
    }

    const held = exists ? readLedger(work, "HEAD") : undefined;
    // A dist that gained its ledger since the plan was made is no cutover any more.
    const cutover = held === undefined;
    // The cutover replaces the whole tree, which only a plan of every unit may do: a plan made
    // against a ledger names the few units that moved, and would leave dist holding those alone.
    if (cutover && !plan.cutover)
      throw new Error(
        `${DIST_BRANCH} holds no ${LEDGER_FILE}, and the plan was made against one: plan again`,
      );
    const ledger: Ledger = { ...held };
    const remove = (path: string) => rmSync(join(work, path), { recursive: true, force: true });

    if (cutover) for (const entry of readdirSync(work)) if (entry !== ".git") remove(entry);

    // dist may have moved since the plan was made: a unit it holds at the planned version or a
    // later one is left as it is.
    const published = plan.publish.filter((unit) => {
      const now = ledger[unit.name];
      return !now || now.kind !== unit.kind || compareSemver(unit.version, now.version) > 0;
    });
    for (const unit of published) {
      const target = distFolder(unit);
      // A name that moved between plugin and skill leaves its old folder behind otherwise.
      const now = ledger[unit.name];
      if (now && now.kind !== unit.kind) remove(distFolder({ name: unit.name, kind: now.kind }));
      remove(target);
      if (unit.kind === "plugin") {
        const from = join(built, unit.name);
        if (!existsSync(from)) throw new Error(`${unit.name}: no build at ${from}`);
        copyFiles(from, join(work, target), filesUnder(from));
      } else {
        const from = join(options.root, unit.folder);
        copyFiles(from, join(work, target), skillFiles(options.root, unit.folder));
      }
      ledger[unit.name] = {
        kind: unit.kind,
        version: unit.version,
        source: options.source,
        date,
      };
    }
    for (const unit of plan.retire) {
      if (!ledger[unit.name]) continue;
      remove(distFolder(unit));
      delete ledger[unit.name];
    }

    const hasSkills = Object.values(ledger).some((unit) => unit.kind === "skill");
    if (hasSkills) {
      mkdirSync(join(work, "skills/.claude-plugin"), { recursive: true });
      writeFileSync(join(work, "skills/.claude-plugin/plugin.json"), skillsManifest(ledger));
    } else remove("skills");
    writeFileSync(join(work, LEDGER_FILE), renderLedger(ledger));

    run(["add", "-A"]);
    // A Release for each planned unit dist now holds at the planned version: the ones this run
    // published, and the ones an earlier run of the same plan did, whose Release it may not have
    // got to. A cutover plan names none, however often it is run.
    const releases: GithubRelease[] = plan.cutover
      ? []
      : plan.publish
          .filter((unit) => ledger[unit.name]?.version === unit.version)
          .map((unit) => ({
            tag: unit.tag,
            title: `${unit.name} ${unit.version}`,
            notes: unit.notes,
            prerelease: unit.prerelease,
          }));
    if (run(["status", "--porcelain"]) === "") return { tags: [], releases };

    run([
      "commit",
      "--quiet",
      "-m",
      subject({ ...plan, cutover }, published),
      "-m",
      `Built from ${options.source}.`,
    ]);
    const tags = published.map((unit) => unit.tag);
    for (const unit of published)
      run([
        "tag",
        "-a",
        unit.tag,
        "-m",
        `${unit.name} ${unit.version}`,
        "-m",
        `Built from ${options.source}.`,
      ]);
    run(["push", "--quiet", "--atomic", "origin", DIST_BRANCH, ...tags]);
    return { commit: run(["rev-parse", "HEAD"]), tags, releases };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const option = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const planFile = option("--plan");
  const built = option("--built");
  if (!planFile || !built) {
    console.error("usage: publish.ts --plan <plan.json> --built <folder> [--result <file>]");
    process.exit(1);
  }
  const root = rootOf();
  const plan = JSON.parse(readFileSync(planFile, "utf8")) as Plan;
  try {
    const result = publish(plan, {
      root,
      built,
      remote: process.env.DIST_REMOTE || git(root, ["remote", "get-url", "origin"]),
      source: process.env.DIST_SOURCE || git(root, ["rev-parse", "HEAD"]),
      ...(process.env.DIST_TOKEN ? { token: process.env.DIST_TOKEN } : {}),
    });
    const resultFile = option("--result");
    if (resultFile) writeFileSync(resultFile, JSON.stringify(result, null, 2) + "\n");
    console.log(
      result.commit
        ? `publish: pushed ${result.commit.slice(0, 7)} to ${DIST_BRANCH} with ${result.tags.length} tags`
        : `publish: ${DIST_BRANCH} already holds this release`,
    );
  } catch (e) {
    console.error(`publish: ${(e as Error).message}`);
    process.exit(1);
  }
}

if (import.meta.main) main();
