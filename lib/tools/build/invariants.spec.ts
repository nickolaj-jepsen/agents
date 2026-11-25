// Cross-file checks that belong to no one package. The kit's own are in its specs:
// `lib/kits/catalog/src/model.spec.ts` (COMPONENTS.md and the kit index in AGENTS.md match the
// manifests); `content.spec.ts` holds that every plugin has a README.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { repoRoot } from "./content.ts";
import { checkReadme } from "./readme.ts";

type Entry = { name: string; source: string | Record<string, string> };
/** An app folder's facts: whether it has a Claude half, and whether it is unreleased. */
type App = { name: string; claude: boolean; private: boolean };

/** Every app folder, read from its package.json. */
function apps(root: string): App[] {
  return readdirSync(join(root, "apps"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const file = join(root, "apps", e.name, "package.json");
      const pkg = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
      return { name: e.name, claude: "claude" in pkg, private: pkg.private === true };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** An app's entry on the `dist` branch: a `git-subdir` there, one folder per plugin. */
const fromDist = (name: string) => ({
  source: "git-subdir",
  url: "nickolaj-jepsen/agents",
  path: name,
  ref: "dist",
});

function entries(root: string): Entry[] {
  const file = join(root, ".claude-plugin/marketplace.json");
  return (JSON.parse(readFileSync(file, "utf8")) as { plugins: Entry[] }).plugins;
}

/**
 * What a marketplace's plugin list gets wrong: a released Claude half that is not listed from the
 * `dist` branch's `<name>/` folder, an unreleased one (`"private": true`) that is listed, or an
 * entry for an app that has no Claude half at all.
 */
function problems(root: string): { missing: string[]; unreleased: string[]; stray: string[] } {
  // `skills` is the other entry: it discovers `skills/` without a per-skill list.
  const published = entries(root).filter((p) => p.name !== "skills");
  const listed = new Map(published.map((p) => [p.name, p.source]));
  const facts = apps(root);
  return {
    missing: facts
      .filter((a) => a.claude && !a.private)
      .map((a) => a.name)
      .filter((name) => JSON.stringify(listed.get(name)) !== JSON.stringify(fromDist(name))),
    unreleased: facts
      .filter((a) => a.private)
      .map((a) => a.name)
      .filter((name) => listed.has(name)),
    stray: published
      .filter((p) => !facts.some((a) => a.name === p.name && a.claude))
      .map((p) => p.name),
  };
}

/** A checkout with apps and a marketplace: `listings` are the entries published, `folders` the apps. */
function checkout(listings: string[], folders: { name: string; pkg: Record<string, unknown> }[]) {
  const root = mkdtempSync(join(tmpdir(), "agents-marketplace-"));
  for (const { name, pkg } of folders) {
    mkdirSync(join(root, "apps", name), { recursive: true });
    writeFileSync(join(root, "apps", name, "package.json"), JSON.stringify(pkg));
  }
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(root, ".claude-plugin/marketplace.json"),
    JSON.stringify({
      plugins: [
        { name: "skills", source: "./" },
        ...listings.map((name) => ({ name, source: fromDist(name) })),
      ],
    }),
  );
  return root;
}

describe(".claude-plugin/marketplace.json", () => {
  const file = join(repoRoot, ".claude-plugin/marketplace.json");
  const { plugins: all } = JSON.parse(readFileSync(file, "utf8")) as { plugins: Entry[] };

  it("lists every released plugin that has a Claude half, from the dist branch's <name>/ folder", () => {
    const { missing } = problems(repoRoot);
    expect(
      missing,
      `add { "name": "<name>", "source": ${JSON.stringify(fromDist("<name>"))} } to .claude-plugin/marketplace.json for: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("lists no unreleased plugin", () => {
    const { unreleased } = problems(repoRoot);
    expect(
      unreleased,
      `remove from .claude-plugin/marketplace.json: ${unreleased.join(", ")} set "private": true in apps/<name>/package.json, so they are unreleased`,
    ).toEqual([]);
  });

  it("lists only plugins that have a Claude half", () => {
    const { stray } = problems(repoRoot);
    expect(
      stray,
      `remove from .claude-plugin/marketplace.json, or add a \`claude\` field to apps/<name>/package.json: ${stray.join(", ")}`,
    ).toEqual([]);
  });

  it("lists each plugin once", () => {
    const names = all.map((p) => p.name);
    const twice = names.filter((name, i) => names.indexOf(name) !== i);
    expect(twice, "an entry of .claude-plugin/marketplace.json is repeated").toEqual([]);
  });

  it("keeps the skills entry, sourced from the repo root", () => {
    expect(
      all.find((p) => p.name === "skills")?.source,
      'add { "name": "skills", "source": "./", "strict": false } to .claude-plugin/marketplace.json',
    ).toBe("./");
  });
});

describe("the marketplace rule", () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it("fails for an unreleased plugin listed and for a released one missing", () => {
    const root = checkout(
      ["hidden"],
      [
        { name: "open", pkg: { claude: {} } },
        { name: "hidden", pkg: { claude: {}, private: true } },
      ],
    );
    roots.push(root);
    expect(problems(root).missing, "a released Claude half must be listed").toEqual(["open"]);
    expect(problems(root).unreleased, "an unreleased app must not be listed").toEqual(["hidden"]);
  });
});

describe("README.md", () => {
  it("is the generator's output: run `pnpm turbo run build` after editing a plugin or skill README, docs/_intro.md or docs/_install.md", () => {
    expect(checkReadme().join("\n")).toBe("");
  });
});
