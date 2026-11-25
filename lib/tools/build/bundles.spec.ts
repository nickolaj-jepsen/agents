import { afterEach, describe, expect, it } from "vitest";
import { checkUses, membersOf, readBundles, readSkillFacts } from "./bundles.ts";
import { cleanup, repo, write } from "./fixtures.ts";
import { versionOf } from "./version.ts";

afterEach(cleanup);

/** A SKILL.md with a version, a category, what it uses, and a body. */
function skill(
  root: string,
  name: string,
  { version = "0.1.0", category = "utilities", uses = [] as string[], body = "Do the thing." } = {},
): void {
  write(
    root,
    `skills/${name}/SKILL.md`,
    [
      "---",
      `name: ${name}`,
      "description: A test skill.",
      "metadata:",
      `  version: ${version}`,
      ...(uses.length > 0 ? [`  uses: [${uses.join(", ")}]`] : []),
      '  summary: "a test skill"',
      `  category: ${category}`,
      "---",
      "",
      body,
      "",
    ].join("\n"),
  );
}

function bundle(root: string, name: string, members: string): void {
  write(
    root,
    `bundles/${name}/README.md`,
    `---\ntitle: ${name}\ntagline: "The ${name} bundle."\n${members}\n---\n\nWhat it is for.\n`,
  );
}

/** Skills where `grill-me` loads `grilling`, which links to `notes`. */
function checkout(): string {
  const root = repo();
  skill(root, "grill-me", { category: "plan", uses: ["grilling"] });
  skill(root, "grilling", {
    category: "plan",
    uses: ["notes"],
    body: "See [notes](../notes/SKILL.md).",
  });
  skill(root, "notes", { category: "docs" });
  skill(root, "draft", { category: "plan", version: "0.0.3" });
  skill(root, "lone", { category: "docs" });
  return root;
}

describe("skill uses", () => {
  it("reads what a skill uses and what its body links to or loads", () => {
    const root = checkout();
    skill(root, "tour", {
      body: "Render it with the `notes` skill, and see [grilling](../grilling/x.md).",
    });
    const facts = new Map(readSkillFacts(root).map((s) => [s.name, s]));
    expect(facts.get("grilling")).toMatchObject({ uses: ["notes"], named: ["notes"] });
    expect(facts.get("tour")?.named).toEqual(["grilling", "notes"]);
  });

  it("fails a link that uses does not name, and a use that is no skill", () => {
    const root = checkout();
    skill(root, "tour", { uses: ["nope"], body: "See [grilling](../grilling/SKILL.md)." });
    expect(checkUses(readSkillFacts(root))).toEqual([
      "skills/tour/SKILL.md: metadata.uses names `nope`, which is no skill",
      "skills/tour/SKILL.md: reads or loads `grilling`; add it to metadata.uses, so a bundle installs it too",
    ]);
  });
});

describe("bundles", () => {
  it("installs what its skills use, and theirs in turn", () => {
    const root = checkout();
    bundle(root, "grill", "skills: [grill-me]");
    const { bundles, problems } = readBundles(root);
    expect(problems).toEqual([]);
    expect(bundles[0]).toMatchObject({
      name: "grill",
      title: "grill",
      tagline: "The grill bundle.",
      listed: ["grill-me"],
      also: ["grilling", "notes"],
      body: "What it is for.",
      path: "bundles/grill",
    });
    expect(membersOf(bundles[0]!)).toEqual(["grill-me", "grilling", "notes"]);
  });

  it("takes a category's skills, leaving out the unfinished ones unless another uses them", () => {
    const root = checkout();
    skill(root, "uses-draft", { category: "docs", uses: ["draft"] });
    bundle(root, "plan", "category: plan");
    bundle(root, "docs-set", "category: docs");
    const byName = new Map(readBundles(root).bundles.map((b) => [b.name, b]));
    expect(byName.get("plan")).toMatchObject({ listed: ["grill-me", "grilling"], also: ["notes"] });
    expect(byName.get("docs-set")).toMatchObject({
      listed: ["lone", "notes", "uses-draft"],
      also: ["draft"],
    });
  });

  it("lists an unfinished skill it names by hand", () => {
    const root = checkout();
    bundle(root, "drafts", "skills: [draft]");
    expect(readBundles(root).bundles[0]?.listed).toEqual(["draft"]);
  });

  it("has a version made from every skill it installs, which moves when one is released", () => {
    const root = checkout();
    bundle(root, "grill", "skills: [grill-me]");
    const before = readBundles(root).bundles[0]!.version;
    expect(before).toBe(
      versionOf([
        { name: "grill-me", version: "0.1.0" },
        { name: "grilling", version: "0.1.0" },
        { name: "notes", version: "0.1.0" },
      ]),
    );
    // A skill it installs only because another uses it moves it too.
    skill(root, "notes", { category: "docs", version: "0.1.1" });
    expect(readBundles(root).bundles[0]!.version).not.toBe(before);
  });

  it("lists the hand-picked bundles before the categories'", () => {
    const root = checkout();
    bundle(root, "a-plan", "category: plan");
    bundle(root, "z-grill", "skills: [grill-me]");
    expect(readBundles(root).bundles.map((b) => b.name)).toEqual(["z-grill", "a-plan"]);
  });

  it("refuses what it cannot resolve, and leaves the rest", () => {
    const root = checkout();
    bundle(root, "ok", "skills: [lone]");
    bundle(root, "both", "skills: [lone]\ncategory: docs");
    bundle(root, "neither", "credit: nobody");
    bundle(root, "ghost", "skills: [lone, gone]");
    bundle(root, "nocat", "category: nowhere");
    bundle(root, "empty", "skills: []");
    bundle(root, "notes", "skills: [lone]");
    write(root, "bundles/bare/notes.txt", "no README\n");
    write(root, "bundles/untitled/README.md", "---\ntagline: x\nskills: [lone]\n---\n");
    const { bundles, problems } = readBundles(root);
    expect(bundles.map((b) => b.name)).toEqual(["ok"]);
    expect(problems).toEqual([
      "bundles/bare: has no README.md",
      "bundles/both/README.md: name its skills with `skills: [...]` or `category: <slug>`, one of the two",
      "bundles/empty/README.md: has no skills",
      "bundles/ghost/README.md: `skills` names what is no released skill: gone",
      "bundles/neither/README.md: name its skills with `skills: [...]` or `category: <slug>`, one of the two",
      "bundles/nocat/README.md: `category: nowhere` is no skill's category",
      "bundles/notes/README.md: `notes` is a skill's name too; a bundle needs a name of its own",
      "bundles/untitled/README.md: frontmatter `title` must be a non-empty string",
    ]);
  });
});
