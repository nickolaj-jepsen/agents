import { chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type Ledger, skillsVersion } from "./dist.ts";
import { bare, bundle, cleanup, commit, folder, plugin, repo, skill, write } from "./fixtures.ts";
import { git } from "./git.ts";
import { planRelease } from "./plan.ts";
import { publish, type PublishOptions } from "./publish.ts";

afterEach(cleanup);

type World = { root: string; remote: string; built: string; options: PublishOptions };

/** A checkout with two plugins and a skill, their builds, and an empty remote. */
function world(): World {
  const root = repo();
  plugin(root, "answer", "0.2.0");
  plugin(root, "spellfix", "1.2.0");
  skill(root, "grill-me", "0.1.0");
  write(root, "skills/grill-me/scripts/run.sh", "#!/bin/sh\necho hi\n");
  chmodSync(join(root, "skills/grill-me/scripts/run.sh"), 0o755);
  const source = commit(root, "start");
  // What a tool leaves behind is not tracked, and is not published.
  write(root, "skills/grill-me/__pycache__/x.pyc", "junk\n");
  const built = folder();
  write(built, "answer/register.js", "answer 1\n");
  write(built, "answer/.claude-plugin/plugin.json", '{"name":"answer","version":"0.2.0"}\n');
  write(built, "spellfix/register.js", "spellfix 1\n");
  const remote = bare();
  return { root, remote, built, options: { root, built, remote, source, date: "2026-11-25" } };
}

const files = (remote: string, ref = "dist"): string[] =>
  git(remote, ["ls-tree", "-r", "--name-only", ref]).split("\n");
const show = (remote: string, path: string, ref = "dist"): string =>
  git(remote, ["show", `${ref}:${path}`]);
const ledgerOf = (remote: string): Ledger => JSON.parse(show(remote, "releases.json")) as Ledger;
const tip = (remote: string): string => git(remote, ["rev-parse", "dist"]);

/** The cutover, so a spec can go on from a dist that holds a ledger. */
function start(w: World): void {
  publish(planRelease(w.root, undefined), w.options);
}

describe("publish", () => {
  it("starts dist with every unit, the ledger, the skills plugin and a tag each", () => {
    const w = world();
    const result = publish(planRelease(w.root, undefined), w.options);

    expect(files(w.remote)).toEqual([
      "answer/.claude-plugin/plugin.json",
      "answer/register.js",
      "releases.json",
      "skills/.claude-plugin/plugin.json",
      "skills/grill-me/SKILL.md",
      "skills/grill-me/scripts/run.sh",
      "spellfix/register.js",
    ]);
    expect(ledgerOf(w.remote)).toEqual({
      answer: { kind: "plugin", version: "0.2.0", source: w.options.source, date: "2026-11-25" },
      "grill-me": { kind: "skill", version: "0.1.0", source: w.options.source, date: "2026-11-25" },
      spellfix: { kind: "plugin", version: "1.2.0", source: w.options.source, date: "2026-11-25" },
    });
    expect(JSON.parse(show(w.remote, "skills/.claude-plugin/plugin.json"))).toMatchObject({
      name: "skills",
      skills: "./",
      version: skillsVersion(ledgerOf(w.remote)),
    });
    // The script keeps its executable bit; the changelog and the leftovers stay behind.
    expect(git(w.remote, ["ls-tree", "dist", "skills/grill-me/scripts/run.sh"])).toMatch(
      /^100755 /,
    );

    expect(result.commit).toBe(tip(w.remote));
    expect(result.tags.sort()).toEqual(["answer--v0.2.0", "grill-me--v0.1.0", "spellfix--v1.2.0"]);
    for (const tag of result.tags) {
      expect(git(w.remote, ["cat-file", "-t", tag])).toBe("tag");
      expect(git(w.remote, ["rev-parse", `${tag}^{commit}`])).toBe(tip(w.remote));
    }
    // The cutover is a baseline, not news: no GitHub Release.
    expect(result.releases).toEqual([]);
    expect(git(w.remote, ["log", "-1", "--format=%s%n%b", "dist"])).toBe(
      `release: start gated releases with 3 units\nBuilt from ${w.options.source}.`,
    );
    expect(git(w.remote, ["log", "-1", "--format=%an", "dist"])).toBe("github-actions[bot]");
  });

  it("replaces a dist from before releases were gated, dropping what is not released", () => {
    const w = world();
    git(w.root, ["checkout", "-q", "--orphan", "dist"]);
    git(w.root, ["rm", "-rq", "--cached", "."]);
    write(w.root, "answer/old.js", "old\n");
    write(w.root, "dropped/register.js", "old\n");
    git(w.root, ["add", "answer/old.js", "dropped/register.js"]);
    git(w.root, ["commit", "-q", "-m", "publish abc1234"]);
    git(w.root, ["push", "-q", w.remote, "dist"]);
    git(w.root, ["checkout", "-q", "-f", "main"]);
    const before = tip(w.remote);

    publish(planRelease(w.root, undefined), w.options);

    expect(files(w.remote)).not.toContain("answer/old.js");
    expect(files(w.remote)).not.toContain("dropped/register.js");
    expect(files(w.remote)).toContain("answer/register.js");
    // Appended, never rewritten.
    expect(git(w.remote, ["rev-parse", "dist~1"])).toBe(before);
  });

  it("changes only the bumped unit's folder, whatever else was built", () => {
    const w = world();
    start(w);
    const before = tip(w.remote);
    const skillsPlugin = show(w.remote, "skills/.claude-plugin/plugin.json");

    plugin(w.root, "spellfix", "1.3.0");
    const source = commit(w.root, "release(spellfix): 1.3.0");
    // A kit change rebuilt both; only spellfix was bumped.
    write(w.built, "answer/register.js", "answer 2\n");
    write(w.built, "spellfix/register.js", "spellfix 2\n");
    const plan = planRelease(w.root, ledgerOf(w.remote));
    const result = publish(plan, { ...w.options, source, date: "2026-12-01" });

    expect(git(w.remote, ["diff", "--name-only", before, "dist"]).split("\n")).toEqual([
      "releases.json",
      "spellfix/register.js",
    ]);
    expect(show(w.remote, "answer/register.js")).toBe("answer 1");
    expect(show(w.remote, "spellfix/register.js")).toBe("spellfix 2");
    expect(ledgerOf(w.remote).spellfix).toEqual({
      kind: "plugin",
      version: "1.3.0",
      source,
      date: "2026-12-01",
    });
    expect(ledgerOf(w.remote).answer?.source).toBe(w.options.source);
    // No skill was released, so the skills plugin offers no update.
    expect(show(w.remote, "skills/.claude-plugin/plugin.json")).toBe(skillsPlugin);

    expect(result.tags).toEqual(["spellfix--v1.3.0"]);
    expect(result.releases).toEqual([
      { tag: "spellfix--v1.3.0", title: "spellfix 1.3.0", notes: "- First.", prerelease: false },
    ]);
    expect(git(w.remote, ["log", "-1", "--format=%s", "dist"])).toBe("release: spellfix 1.3.0");
  });

  it("moves the skills plugin's version when a skill is released", () => {
    const w = world();
    start(w);
    const before = JSON.parse(show(w.remote, "skills/.claude-plugin/plugin.json")).version;

    const text = skill(w.root, "grill-me", "0.1.1");
    write(w.root, "skills/grill-me/SKILL.md", text.replace("Do the thing.", "Do it well."));
    commit(w.root, "release(grill-me): 0.1.1");
    const result = publish(planRelease(w.root, ledgerOf(w.remote)), w.options);

    expect(show(w.remote, "skills/grill-me/SKILL.md")).toContain("Do it well.");
    expect(JSON.parse(show(w.remote, "skills/.claude-plugin/plugin.json")).version).not.toBe(
      before,
    );
    expect(result.releases).toEqual([
      { tag: "grill-me--v0.1.1", title: "grill-me 0.1.1", notes: "- First.", prerelease: true },
    ]);
  });

  it("removes a retired unit's folder and ledger entry, and keeps its tag", () => {
    const w = world();
    start(w);
    plugin(w.root, "answer", "0.2.0", { private: true });
    commit(w.root, "chore(answer): unrelease");
    const plan = planRelease(w.root, ledgerOf(w.remote));
    expect(plan.retire.map((u) => u.name)).toEqual(["answer"]);
    const result = publish(plan, w.options);

    expect(files(w.remote).filter((f) => f.startsWith("answer/"))).toEqual([]);
    expect(ledgerOf(w.remote).answer).toBeUndefined();
    expect(result.tags).toEqual([]);
    expect(git(w.remote, ["tag", "--list", "answer--v0.2.0"])).toBe("answer--v0.2.0");
    expect(git(w.remote, ["log", "-1", "--format=%s", "dist"])).toBe("release: retire answer");
  });

  it("publishes nothing twice when the same plan is run again", () => {
    const w = world();
    start(w);
    plugin(w.root, "spellfix", "1.3.0");
    commit(w.root, "release(spellfix): 1.3.0");
    const plan = planRelease(w.root, ledgerOf(w.remote));
    publish(plan, w.options);
    const after = tip(w.remote);

    const again = publish(plan, w.options);
    expect(tip(w.remote)).toBe(after);
    expect(again.commit).toBeUndefined();
    expect(again.tags).toEqual([]);
    // The Releases the first run may not have got to are still named.
    expect(again.releases.map((r) => r.tag)).toEqual(["spellfix--v1.3.0"]);
  });

  it("pushes the commit and its tags together or not at all", () => {
    const w = world();
    start(w);
    const before = tip(w.remote);
    git(w.remote, ["tag", "spellfix--v1.3.0", "dist"]);
    plugin(w.root, "spellfix", "1.3.0");
    commit(w.root, "release(spellfix): 1.3.0");
    // The plan was made without the tag list, as if the tag appeared after it.
    const plan = planRelease(w.root, ledgerOf(w.remote));
    expect(() => publish(plan, w.options)).toThrow();
    expect(tip(w.remote)).toBe(before);
  });

  it("refuses a plan with problems, and a planned plugin that was not built", () => {
    const w = world();
    start(w);
    plugin(w.root, "spellfix", "1.1.0");
    expect(() => publish(planRelease(w.root, ledgerOf(w.remote)), w.options)).toThrow(
      /the plan has problems/,
    );
    plugin(w.root, "spellfix", "1.2.0");
    plugin(w.root, "docfix", "0.0.1");
    commit(w.root, "feat(docfix): start");
    expect(() => publish(planRelease(w.root, ledgerOf(w.remote)), w.options)).toThrow(
      /docfix: no build at/,
    );
  });

  it("makes no GitHub Release for the cutover, however often its plan is run", () => {
    const w = world();
    const plan = planRelease(w.root, undefined);
    publish(plan, w.options);
    const after = tip(w.remote);
    // Run again, dist now holds a ledger: still the cutover's plan, and still nothing to announce.
    const again = publish(plan, w.options);
    expect(tip(w.remote)).toBe(after);
    expect(again).toEqual({ tags: [], releases: [] });
  });

  it("refuses to replace a dist that has no ledger with a plan of a few units", () => {
    const w = world();
    start(w);
    const ledger = ledgerOf(w.remote);
    plugin(w.root, "spellfix", "1.3.0");
    commit(w.root, "release(spellfix): 1.3.0");
    const plan = planRelease(w.root, ledger);
    // The ledger is lost after the plan was made: publishing would leave dist with spellfix alone.
    const clone = folder();
    git(clone, ["clone", "-q", "--branch", "dist", w.remote, "."]);
    git(clone, ["rm", "-q", "releases.json"]);
    git(clone, [
      "-c",
      "user.name=x",
      "-c",
      "user.email=x@example.invalid",
      "commit",
      "-qm",
      "lose it",
    ]);
    git(clone, ["push", "-q", "origin", "dist"]);
    const before = tip(w.remote);

    expect(() => publish(plan, w.options)).toThrow(/holds no releases.json/);
    expect(tip(w.remote)).toBe(before);
    expect(files(w.remote)).toContain("answer/register.js");
  });

  it("names no Release for a unit dist already holds at a later version", () => {
    const w = world();
    start(w);
    plugin(w.root, "spellfix", "1.3.0");
    commit(w.root, "release(spellfix): 1.3.0");
    const stale = planRelease(w.root, ledgerOf(w.remote));
    plugin(w.root, "spellfix", "1.4.0");
    commit(w.root, "release(spellfix): 1.4.0");
    publish(planRelease(w.root, ledgerOf(w.remote)), w.options);
    const after = tip(w.remote);

    // The older plan arrives late: 1.4.0 stays, and 1.3.0, which was never tagged, gets no Release.
    const late = publish(stale, w.options);
    expect(tip(w.remote)).toBe(after);
    expect(ledgerOf(w.remote).spellfix?.version).toBe("1.4.0");
    expect(late).toEqual({ tags: [], releases: [] });
  });

  it("moves a name from plugin to skill without leaving the plugin's folder behind", () => {
    const w = world();
    start(w);
    git(w.root, ["rm", "-rq", "apps/answer"]);
    skill(w.root, "answer", "0.3.0");
    commit(w.root, "feat(answer): a skill now");
    publish(planRelease(w.root, ledgerOf(w.remote)), w.options);

    expect(files(w.remote).filter((f) => f.startsWith("answer/"))).toEqual([]);
    expect(files(w.remote)).toContain("skills/answer/SKILL.md");
    expect(ledgerOf(w.remote).answer).toMatchObject({ kind: "skill", version: "0.3.0" });
  });
});

describe("publish bundles", () => {
  /** The world with a second skill, and a bundle of both. */
  function bundled(): World {
    const w = world();
    // The base world's untracked leftover would be committed with the rest here.
    rmSync(join(w.root, "skills/grill-me/__pycache__"), { recursive: true });
    skill(w.root, "grilling", "0.1.0");
    bundle(w.root, "grill", ["grill-me", "grilling"]);
    commit(w.root, "a bundle");
    return { ...w, options: { ...w.options, source: git(w.root, ["rev-parse", "HEAD"]) } };
  }

  it("writes a bundle's skills as dist holds them, with a Claude plugin and a pi package", () => {
    const w = bundled();
    const result = publish(planRelease(w.root, undefined), w.options);

    expect(files(w.remote).filter((f) => f.startsWith("bundles/"))).toEqual([
      "bundles/grill/.claude-plugin/plugin.json",
      "bundles/grill/grill-me/SKILL.md",
      "bundles/grill/grill-me/scripts/run.sh",
      "bundles/grill/grilling/SKILL.md",
      "bundles/grill/package.json",
    ]);
    expect(show(w.remote, "bundles/grill/grill-me/SKILL.md")).toBe(
      show(w.remote, "skills/grill-me/SKILL.md"),
    );
    expect(git(w.remote, ["ls-tree", "dist", "bundles/grill/grill-me/scripts/run.sh"])).toMatch(
      /^100755 /,
    );
    const ledger = ledgerOf(w.remote);
    expect(JSON.parse(show(w.remote, "bundles/grill/.claude-plugin/plugin.json"))).toEqual({
      name: "grill",
      version: ledger.grill?.version,
      description: "The grill bundle.",
      author: { name: "Nickolaj Jepsen" },
      skills: "./",
    });
    expect(JSON.parse(show(w.remote, "bundles/grill/package.json"))).toMatchObject({
      keywords: ["pi-package"],
      pi: { skills: ["./"] },
    });
    expect(ledger.grill).toMatchObject({ kind: "bundle" });
    // A bundle gets no tag of its own.
    expect(result.tags.filter((t) => t.startsWith("grill--"))).toEqual([]);
  });

  it("writes a bundle again when one of its skills is released, and only then", () => {
    const w = bundled();
    publish(planRelease(w.root, undefined), w.options);
    const first = ledgerOf(w.remote).grill?.version;

    plugin(w.root, "spellfix", "1.3.0");
    commit(w.root, "release(spellfix): 1.3.0");
    expect(planRelease(w.root, ledgerOf(w.remote)).bundles).toEqual([]);

    const text = skill(w.root, "grilling", "0.1.1");
    write(w.root, "skills/grilling/SKILL.md", text.replace("Do the thing.", "Ask in rounds."));
    commit(w.root, "release(grilling): 0.1.1");
    const plan = planRelease(w.root, ledgerOf(w.remote));
    expect(plan.bundles.map((b) => [b.name, b.from])).toEqual([["grill", first]]);
    const result = publish(plan, w.options);

    expect(show(w.remote, "bundles/grill/grilling/SKILL.md")).toContain("Ask in rounds.");
    expect(ledgerOf(w.remote).grill?.version).not.toBe(first);
    expect(result.releases.map((r) => r.tag)).toEqual(["spellfix--v1.3.0", "grilling--v0.1.1"]);
  });

  it("writes a bundle whose set changed, with nothing released", () => {
    const w = bundled();
    publish(planRelease(w.root, undefined), w.options);
    bundle(w.root, "grill", ["grilling"]);
    commit(w.root, "grill: grilling alone");
    const plan = planRelease(w.root, ledgerOf(w.remote));
    expect(plan.publish).toEqual([]);
    publish(plan, w.options);

    expect(files(w.remote).filter((f) => f.startsWith("bundles/grill/grill"))).toEqual([
      "bundles/grill/grilling/SKILL.md",
    ]);
    expect(git(w.remote, ["log", "-1", "--format=%s", "dist"])).toBe("release: bundle grill");
  });

  it("removes a bundle that is gone, and the bundles folder with the last one", () => {
    const w = bundled();
    publish(planRelease(w.root, undefined), w.options);
    git(w.root, ["rm", "-rq", "bundles"]);
    commit(w.root, "no bundles");
    const plan = planRelease(w.root, ledgerOf(w.remote));
    expect(plan.retire).toEqual([
      { name: "grill", kind: "bundle", version: ledgerOf(w.remote).grill?.version },
    ]);
    publish(plan, w.options);

    expect(files(w.remote).filter((f) => f.startsWith("bundles/"))).toEqual([]);
    expect(ledgerOf(w.remote).grill).toBeUndefined();
  });
});
