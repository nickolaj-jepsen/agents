import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadContent } from "./content.ts";
import { bare, cleanup, commit, folder, note, plugin, repo, skill, write } from "./fixtures.ts";
import { git } from "./git.ts";
import { planRelease } from "./plan.ts";
import { publish } from "./publish.ts";
import { release, renderStatus, status } from "./release.ts";

afterEach(cleanup);

const read = (root: string, file: string): string => readFileSync(join(root, file), "utf8");

/** A checkout with a plugin and a skill, each with one line waiting under `[Unreleased]`. */
function checkout(): string {
  const root = repo();
  plugin(root, "answer", "0.2.0");
  note(
    root,
    "apps/answer/CHANGELOG.md",
    read(root, "apps/answer/CHANGELOG.md"),
    "Opens with Ctrl+O.",
  );
  skill(root, "grill-me", "0.1.0");
  note(
    root,
    "skills/grill-me/CHANGELOG.md",
    read(root, "skills/grill-me/CHANGELOG.md"),
    "Asks in rounds.",
  );
  commit(root, "start");
  return root;
}

describe("release", () => {
  it("bumps a plugin a level: the version, the dated changelog section, and one commit", () => {
    const root = checkout();
    const before = read(root, "apps/answer/package.json");

    const result = release(root, "answer", "minor", { date: "2026-12-01" });

    expect(result).toMatchObject({
      from: "0.2.0",
      version: "0.3.0",
      tier: "pre-release",
      notes: ["- Opens with Ctrl+O."],
      dryRun: false,
    });
    expect(read(root, "apps/answer/package.json")).toBe(
      before.replace('"version": "0.2.0"', '"version": "0.3.0"'),
    );
    expect(read(root, "apps/answer/CHANGELOG.md")).toBe(
      "# Changelog\n\n## [Unreleased]\n\n## [0.3.0] - 2026-12-01\n\n- Opens with Ctrl+O.\n\n## [0.2.0] - 2026-11-01\n\n- First.\n",
    );
    expect(git(root, ["log", "-1", "--format=%s"])).toBe("release(answer): 0.3.0");
    expect(git(root, ["show", "--name-only", "--format=", "HEAD"]).split("\n").sort()).toEqual([
      "apps/answer/CHANGELOG.md",
      "apps/answer/package.json",
    ]);
    expect(git(root, ["status", "--porcelain"])).toBe("");
    // CI tags what it publishes; the command tags nothing.
    expect(git(root, ["tag", "--list"])).toBe("");
    expect(result.text).toContain("answer 0.2.0 → 0.3.0 (pre-release)");
    expect(result.text).toContain("merging it to main publishes it");
  });

  it("takes each level and a version by name", () => {
    expect(release(checkout(), "answer", "patch").version).toBe("0.2.1");
    expect(release(checkout(), "answer", "major").version).toBe("1.0.0");
    const named = release(checkout(), "answer", "0.9.0");
    expect(named.version).toBe("0.9.0");
  });

  it("leaves a nested version alone when it writes a plugin's own", () => {
    const root = checkout();
    plugin(root, "answer", "0.2.0", { engines: { version: "0.2.0" } });
    note(root, "apps/answer/CHANGELOG.md", read(root, "apps/answer/CHANGELOG.md"), "A line.");
    commit(root, "nest a version");
    release(root, "answer", "patch");
    const pkg = JSON.parse(read(root, "apps/answer/package.json"));
    expect(pkg.version).toBe("0.2.1");
    expect(pkg.engines.version).toBe("0.2.0");
  });

  it("bumps a skill in its frontmatter, and the loader reads the new version", () => {
    const root = repo();
    skill(root, "grill-me", "0.1.0");
    note(
      root,
      "skills/grill-me/CHANGELOG.md",
      read(root, "skills/grill-me/CHANGELOG.md"),
      "Asks in rounds.",
    );
    commit(root, "start");
    const before = read(root, "skills/grill-me/SKILL.md");

    const result = release(root, "grill-me", "patch", { date: "2026-12-01" });

    expect(result.version).toBe("0.1.1");
    expect(read(root, "skills/grill-me/SKILL.md")).toBe(
      before.replace("  version: 0.1.0", "  version: 0.1.1"),
    );
    expect(read(root, "skills/grill-me/CHANGELOG.md")).toContain(
      "## [0.1.1] - 2026-12-01\n\n- Asks in rounds.",
    );
    expect(git(root, ["log", "-1", "--format=%s"])).toBe("release(grill-me): 0.1.1");
    expect(loadContent(root).skills.find((s) => s.name === "grill-me")?.version).toBe("0.1.1");
  });

  it("refuses an unknown unit, a dirty tree and a version that does not go up", () => {
    const root = checkout();
    expect(() => release(root, "nope", "patch")).toThrow(/unknown unit `nope`/);
    expect(() => release(root, "answer", "0.2.0")).toThrow(/0.2.0 does not go up from 0.2.0/);
    expect(() => release(root, "answer", "0.1.9")).toThrow(/does not go up/);
    expect(() => release(root, "answer", "0.3.0-rc.1")).toThrow(/is no version/);
    expect(() => release(root, "answer", "bigger")).toThrow(/is no version/);
    write(root, "notes.txt", "untracked\n");
    expect(() => release(root, "answer", "patch")).toThrow(/the tree is dirty/);
  });

  it("refuses to release nothing: an empty Unreleased, or no changelog", () => {
    const root = checkout();
    release(root, "answer", "patch");
    expect(() => release(root, "answer", "patch")).toThrow(/nothing under `## \[Unreleased\]`/);
    git(root, ["rm", "-q", "skills/grill-me/CHANGELOG.md"]);
    commit(root, "drop the changelog");
    expect(() => release(root, "grill-me", "patch")).toThrow(/CHANGELOG.md is missing/);
  });

  it("writes nothing on --dry-run and leaves the tree and HEAD as they were", () => {
    const root = checkout();
    const head = git(root, ["rev-parse", "HEAD"]);
    const result = release(root, "answer", "minor", { dryRun: true, date: "2026-12-01" });
    expect(result.dryRun).toBe(true);
    expect(result.text).toContain("## [0.3.0] - 2026-12-01");
    expect(result.text).toContain("dry run: nothing written");
    expect(git(root, ["rev-parse", "HEAD"])).toBe(head);
    expect(git(root, ["status", "--porcelain"])).toBe("");
    expect(JSON.parse(read(root, "apps/answer/package.json")).version).toBe("0.2.0");
  });
});

describe("release --status", () => {
  /** The checkout published to a remote, with dist's tip fetched as `FETCH_HEAD`. */
  function published(): { root: string; built: string } {
    const root = repo();
    plugin(root, "answer", "0.2.0");
    plugin(root, "spellfix", "1.2.0");
    skill(root, "grill-me", "0.1.0");
    const source = commit(root, "start");
    const built = folder();
    write(built, "answer/register.js", "answer 1\n");
    write(built, "spellfix/register.js", "spellfix 1\n");
    const remote = bare();
    git(root, ["remote", "add", "origin", remote]);
    publish(planRelease(root, undefined), { root, built, remote, source, date: "2026-11-25" });
    git(root, ["fetch", "-q", "origin", "dist"]);
    // The builds as turbo leaves them in each app.
    write(root, "apps/answer/dist/register.js", "answer 1\n");
    write(root, "apps/spellfix/dist/register.js", "spellfix 1\n");
    write(root, ".gitignore", "dist/\n");
    commit(root, "ignore the builds");
    return { root, built };
  }

  it("says nothing when every unit matches what dist holds", () => {
    const { root } = published();
    expect(status(root, "FETCH_HEAD")).toEqual([]);
    expect(renderStatus([])).toEqual([]);
  });

  it("lists unreleased notes, with or without a dist to compare against", () => {
    const { root } = published();
    note(root, "apps/answer/CHANGELOG.md", read(root, "apps/answer/CHANGELOG.md"), "A line.");
    expect(renderStatus(status(root))).toEqual(["answer 0.2.0: 1 unreleased note"]);
    expect(renderStatus(status(root, "FETCH_HEAD"))).toEqual(["answer 0.2.0: 1 unreleased note"]);
  });

  it("lists a plugin whose build differs from dist at the same version", () => {
    const { root } = published();
    // A kit changed: the plugin's folder did not, its build did.
    write(root, "apps/spellfix/dist/register.js", "spellfix 2\n");
    // What the mod engine lays beside a loaded build is not part of it.
    write(root, "apps/answer/dist/tsconfig.json", "{}\n");
    write(root, "apps/answer/dist/.claude-plugin/types/api.d.ts", "export {};\n");
    expect(renderStatus(status(root, "FETCH_HEAD"))).toEqual([
      "spellfix 1.2.0: its build differs from dist",
    ]);
  });

  it("lists a skill whose folder differs from dist at the same version", () => {
    const { root } = published();
    write(root, "skills/grill-me/reference.md", "More.\n");
    commit(root, "docs(grill-me): a reference");
    expect(renderStatus(status(root, "FETCH_HEAD"))).toEqual([
      "grill-me 0.1.0: its folder differs from dist",
    ]);
  });

  it("lists what a merge would publish: a bumped unit and a new one", () => {
    const { root } = published();
    plugin(root, "spellfix", "1.3.0");
    skill(root, "tour", "0.0.1");
    commit(root, "bump and add");
    expect(renderStatus(status(root, "FETCH_HEAD"))).toEqual([
      "spellfix 1.3.0: publishes on merge (dist has 1.2.0)",
      "tour 0.0.1: publishes on merge (new on dist)",
    ]);
  });

  it("does not guess at a plugin that has no build", () => {
    const { root } = published();
    plugin(root, "docfix", "0.0.1");
    commit(root, "feat(docfix): start");
    const rows = status(root, "FETCH_HEAD");
    expect(rows.map((r) => r.name)).toEqual(["docfix"]);
    git(root, ["rm", "-rq", "--cached", "apps/spellfix"]);
    expect(status(root, "FETCH_HEAD").find((r) => r.name === "spellfix")).toBeUndefined();
  });
});

describe("release command", () => {
  const cli = join(import.meta.dirname, "release.ts");
  const run = (root: string, args: string[]) =>
    spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });

  it("runs from a repository root, prints a dry run, and says how to call it", () => {
    const root = checkout();
    const dry = run(root, ["answer", "patch", "--dry-run"]);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain("answer 0.2.0 → 0.2.1 (pre-release)");
    expect(git(root, ["status", "--porcelain"])).toBe("");

    const bare = run(root, ["answer"]);
    expect(bare.status).not.toBe(0);
    expect(bare.stderr).toContain("usage: pnpm release <name> <patch|minor|major|x.y.z>");

    const unknown = run(root, ["nope", "patch"]);
    expect(unknown.status).not.toBe(0);
    expect(unknown.stderr).toContain("unknown unit `nope`");
  });

  it("reports the notes alone when there is no dist to read", () => {
    const root = checkout();
    const remote = bare();
    git(root, ["remote", "add", "origin", remote]);
    const out = run(root, ["--status"]);
    expect(out.status).toBe(0);
    expect(out.stdout.trim().split("\n")).toEqual([
      "answer 0.2.0: 1 unreleased note",
      "grill-me 0.1.0: 1 unreleased note",
    ]);
  });
});
