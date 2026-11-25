import { afterEach, describe, expect, it } from "vitest";
import type { Ledger } from "./dist.ts";
import { bare, cleanup, commit, folder, plugin, repo, skill, write } from "./fixtures.ts";
import { git } from "./git.ts";
import { fetchState, planRelease, renderPlan } from "./plan.ts";
import { publish } from "./publish.ts";

afterEach(cleanup);

const held = (kind: "plugin" | "skill", version: string) => ({
  kind,
  version,
  source: "0".repeat(40),
  date: "2026-11-01",
});

/** A checkout with two plugins and a skill, and the ledger that already holds all three. */
function checkout(): { root: string; ledger: Ledger } {
  const root = repo();
  plugin(root, "answer", "0.2.0");
  plugin(root, "spellfix", "1.2.0");
  skill(root, "grill-me", "0.1.0");
  commit(root, "start");
  return {
    root,
    ledger: {
      answer: held("plugin", "0.2.0"),
      spellfix: held("plugin", "1.2.0"),
      "grill-me": held("skill", "0.1.0"),
    },
  };
}

describe("release plan", () => {
  it("releases nothing while every version is the one dist holds", () => {
    const { root, ledger } = checkout();
    // A change with no bump waits.
    write(root, "apps/answer/src/claude.ts", "export {};\n");
    const plan = planRelease(root, ledger);
    expect(plan).toMatchObject({ cutover: false, publish: [], retire: [], unchanged: 3 });
    expect(plan.problems).toEqual([]);
    expect(renderPlan(plan)).toContain("Nothing to release");
  });

  it("releases a bumped plugin and a bumped skill, with their notes, tag and tier", () => {
    const { root, ledger } = checkout();
    plugin(root, "spellfix", "1.3.0");
    skill(root, "grill-me", "0.1.1");
    const plan = planRelease(root, ledger);
    expect(plan.problems).toEqual([]);
    expect(plan.unchanged).toBe(1);
    expect(plan.publish).toEqual([
      {
        name: "spellfix",
        kind: "plugin",
        folder: "apps/spellfix",
        version: "1.3.0",
        from: "1.2.0",
        tier: "release",
        prerelease: false,
        tag: "spellfix--v1.3.0",
        notes: "- First.",
      },
      {
        name: "grill-me",
        kind: "skill",
        folder: "skills/grill-me",
        version: "0.1.1",
        from: "0.1.0",
        tier: "pre-release",
        prerelease: true,
        tag: "grill-me--v0.1.1",
        notes: "- First.",
      },
    ]);
    expect(renderPlan(plan)).toContain("| spellfix | plugin | 1.2.0 → 1.3.0 | release |");
  });

  it("releases a unit dist has never held, at whatever version it has", () => {
    const { root, ledger } = checkout();
    plugin(root, "docfix", "0.0.1");
    const plan = planRelease(root, ledger);
    expect(plan.publish.map((u) => [u.name, u.from, u.tier])).toEqual([
      ["docfix", undefined, "unfinished"],
    ]);
  });

  it("leaves a private plugin and a skill under unreleased/ out", () => {
    const { root, ledger } = checkout();
    plugin(root, "secret", "0.1.0", { private: true });
    write(root, "unreleased/skills/draft/SKILL.md", "---\nname: draft\n---\n");
    expect(planRelease(root, ledger).publish).toEqual([]);
  });

  it("retires a unit dist holds that is no longer released here", () => {
    const { root, ledger } = checkout();
    plugin(root, "answer", "0.2.0", { private: true });
    const plan = planRelease(root, {
      ...ledger,
      gone: held("skill", "0.4.0"),
    });
    expect(plan.retire).toEqual([
      { name: "answer", kind: "plugin", version: "0.2.0" },
      { name: "gone", kind: "skill", version: "0.4.0" },
    ]);
    expect(renderPlan(plan)).toContain("Removed from `dist`: answer 0.2.0, gone 0.4.0.");
  });

  it("publishes every unit at the cutover, and compares nothing", () => {
    const { root } = checkout();
    // Lower than what an old dist would have said: the cutover does not look.
    plugin(root, "spellfix", "0.2.0");
    const plan = planRelease(root, undefined);
    expect(plan.cutover).toBe(true);
    expect(plan.problems).toEqual([]);
    expect(plan.publish.map((u) => u.name)).toEqual(["answer", "spellfix", "grill-me"]);
    expect(renderPlan(plan)).toContain("this is the cutover");
  });

  it("fails a version that goes down, has a suffix, or was tagged before", () => {
    const { root, ledger } = checkout();
    plugin(root, "spellfix", "1.1.0");
    plugin(root, "answer", "0.3.0-rc.1");
    skill(root, "grill-me", "0.2.0");
    const plan = planRelease(root, ledger, new Set(["grill-me--v0.2.0"]));
    expect(plan.problems).toEqual([
      "answer: 0.3.0-rc.1 has a suffix; there is one channel, so a version is three numbers",
      "spellfix: 1.1.0 is lower than the 1.2.0 on dist; a version only goes up",
      "grill-me: the tag grill-me--v0.2.0 already exists; a version is published once, so bump it",
    ]);
    expect(renderPlan(plan)).toContain("**The plan fails:**");
  });

  it("fails a bump whose changelog has no section for the version", () => {
    const { root, ledger } = checkout();
    plugin(root, "answer", "0.3.0");
    write(root, "apps/answer/CHANGELOG.md", "# Changelog\n\n## [Unreleased]\n\n- Soon.\n");
    expect(planRelease(root, ledger).problems.join("\n")).toContain(
      "answer: apps/answer/CHANGELOG.md has no `## [0.3.0]` section",
    );
  });

  it("fails a name that is both a plugin and a skill", () => {
    const { root, ledger } = checkout();
    skill(root, "answer", "0.1.0");
    expect(planRelease(root, ledger).problems.join("\n")).toContain(
      "answer: is both apps/answer and skills/answer",
    );
  });
});

describe("the state a plan is made against", () => {
  it("has no ledger while the remote has no dist, then reads the one a publish wrote", () => {
    const { root } = checkout();
    const remote = bare();
    git(root, ["remote", "add", "origin", remote]);
    expect(fetchState(root, "origin")).toEqual({ ledger: undefined, tags: new Set() });

    const built = folder();
    write(built, "answer/register.js", "1\n");
    write(built, "spellfix/register.js", "1\n");
    publish(planRelease(root, undefined), {
      root,
      built,
      remote,
      source: git(root, ["rev-parse", "HEAD"]),
      date: "2026-11-25",
    });

    const state = fetchState(root, "origin");
    // Reading dist's tip leaves the checkout's own history whole.
    expect(git(root, ["rev-parse", "--is-shallow-repository"])).toBe("false");
    expect(Object.keys(state.ledger ?? {}).sort()).toEqual(["answer", "grill-me", "spellfix"]);
    expect(state.ledger?.spellfix).toMatchObject({ kind: "plugin", version: "1.2.0" });
    expect([...state.tags].sort()).toEqual([
      "answer--v0.2.0",
      "grill-me--v0.1.0",
      "spellfix--v1.2.0",
    ]);
    expect(planRelease(root, state.ledger, state.tags)).toMatchObject({
      cutover: false,
      publish: [],
      unchanged: 3,
    });
  });

  it("has no ledger for a dist from before releases were gated", () => {
    const { root } = checkout();
    const remote = bare();
    git(root, ["remote", "add", "origin", remote]);
    git(root, ["checkout", "-q", "--orphan", "dist"]);
    git(root, ["rm", "-rq", "--cached", "."]);
    write(root, "answer/register.js", "old\n");
    git(root, ["add", "answer/register.js"]);
    git(root, ["commit", "-q", "-m", "publish abc1234"]);
    git(root, ["push", "-q", "origin", "dist"]);
    expect(fetchState(root, "origin").ledger).toBeUndefined();
  });
});
