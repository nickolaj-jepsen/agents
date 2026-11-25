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
import { dirname, join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { CATEGORIES, loadContent, repoRoot } from "./content.ts";
import { SEMVER, tierOf } from "./version.ts";

const content = loadContent();

/** An app's package.json, or nothing when the folder has none. */
function manifest(name: string): Record<string, any> {
  const file = join(repoRoot, "apps", name, "package.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}

/** The app folders the model lists: every plugin folder but an unreleased one (`"private": true`). */
function releasedAppFolders(): string[] {
  return readdirSync(join(repoRoot, "apps"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => manifest(name).private !== true);
}

describe("content", () => {
  it("has a plugin for every released plugin folder, with a README", () => {
    expect(content.plugins.map((p) => p.name).sort()).toEqual(releasedAppFolders().sort());
    for (const p of content.plugins) {
      expect(existsSync(join(repoRoot, p.path, "README.md"))).toBe(true);
      expect(p.harness.claude || p.harness.pi).toBe(true);
    }
  });

  it("gives every skill a summary and a known category", () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    for (const s of content.skills) {
      expect(s.summary).not.toBe("");
      expect(slugs).toContain(s.category);
    }
    expect(content.categories.flatMap((c) => c.skills)).toHaveLength(content.skills.length);
  });

  it("keeps one version per plugin, in package.json alone", () => {
    const folders = readdirSync(join(repoRoot, "apps"), { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== "site")
      .map((e) => e.name);
    for (const name of folders) {
      const file = join(repoRoot, "apps", name, "package.json");
      if (!existsSync(file)) continue;
      const pkg = JSON.parse(readFileSync(file, "utf8")) as {
        version?: unknown;
        claude?: { version?: unknown };
        pi?: unknown;
      };
      if (!pkg.claude && !pkg.pi) continue;
      expect(pkg.version, `${file}: \`version\` must be semver`).toMatch(SEMVER);
      expect(
        pkg.claude?.version,
        `${file}: remove \`version\` from \`claude\`; package.json's \`version\` is a plugin's only version`,
      ).toBeUndefined();
    }
  });

  // A skill without `metadata.version` fails in `loadSkills`, before this spec runs: one missing
  // string is the whole suite's error.
  it("carries one semver version on every plugin and skill", () => {
    for (const p of content.plugins) {
      expect(p.version, `${p.path}/package.json: \`version\``).toMatch(SEMVER);
    }
    for (const s of content.skills) {
      expect(s.version, `${s.path}/SKILL.md: \`metadata.version\``).toMatch(SEMVER);
    }
  });

  it("reads how finished a plugin or skill is from its version alone", () => {
    for (const item of [...content.plugins, ...content.skills])
      expect(item.tier, `${item.name} ${item.version}`).toBe(tierOf(item.version));
  });

  it("lists unfinished skills last in their own category", () => {
    for (const c of content.categories) {
      const flags = c.skills.map((s) => s.tier === "unfinished");
      expect(flags, c.slug).toEqual([...flags].sort((a, b) => Number(a) - Number(b)));
      for (const s of c.skills) expect(s.category).toBe(c.slug);
    }
  });

  it("gives every doc a title", () => {
    expect(content.docs.length).toBeGreaterThan(0);
    for (const d of content.docs) expect(d.title).not.toBe("");
  });

  it("keeps this checkout's unreleased skills out of the model", () => {
    const dir = join(repoRoot, "unreleased", "skills");
    const folders = existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
      : [];
    const listed = new Set(content.skills.map((s) => s.name));
    expect(
      folders.filter((name) => listed.has(name)),
      "a skill under unreleased/skills/ is not listed: move its folder into skills/ to release it",
    ).toEqual([]);
  });
});

const checkouts: string[] = [];
afterAll(() => {
  for (const root of checkouts) rmSync(root, { recursive: true, force: true });
});

/** A checkout holding only the sources `loadContent` reads, written from `files`. */
function checkout(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "agents-content-"));
  checkouts.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const readme = "---\ntagline: A plugin.\nfeatured: false\nrequires: []\norder: 1\n---\n\nText.\n";

const pkg = (name: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    name: `@nickolaj-jepsen/${name}`,
    version: "0.1.0",
    claude: { name },
    ...extra,
  });

const skill = (name: string) =>
  [
    "---",
    `name: ${name}`,
    "description: A skill.",
    "metadata:",
    "  version: 0.1.0",
    "  summary: A skill.",
    "  category: utilities",
    "---",
    "",
    "Text.",
    "",
  ].join("\n");

describe("unreleased work", () => {
  it("drops a private plugin before it is read as one: no page, row or count", () => {
    const root = checkout({
      "apps/open/package.json": pkg("open"),
      "apps/open/README.md": readme,
      // Its README is not what a listed plugin needs: a private app is dropped before it is read.
      "apps/hidden/package.json": pkg("hidden", { private: true }),
      "apps/hidden/README.md": "not a plugin page\n",
    });
    expect(loadContent(root).plugins.map((p) => p.name)).toEqual(["open"]);
  });

  it("never reads a skill from unreleased/skills/", () => {
    const root = checkout({
      "skills/listed/SKILL.md": skill("listed"),
      "unreleased/skills/hidden/SKILL.md": skill("hidden"),
    });
    expect(loadContent(root).skills.map((s) => s.name)).toEqual(["listed"]);
  });
});

// A page shows the version and, beside it, the changelog when the plugin ships one: both are model
// fields, so a page needs no file system of its own. A small checkout says what the model carries.
describe("page fields", () => {
  let root = "";
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function checkout(files: Record<string, string>): string {
    root = mkdtempSync(join(tmpdir(), "agents-content-"));
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return root;
  }

  const PLUGIN: Record<string, string> = {
    "apps/demo/package.json": JSON.stringify({
      name: "demo",
      version: "1.2.3",
      pi: { extensions: ["./src/pi.ts"] },
    }),
    "apps/demo/README.md": [
      "---",
      "tagline: A demo plugin",
      "featured: false",
      "requires: []",
      "order: 1",
      "---",
      "",
      "The demo's page.",
      "",
    ].join("\n"),
  };

  const SKILL: Record<string, string> = {
    "skills/demo/SKILL.md": [
      "---",
      "description: A demo skill",
      "metadata:",
      "  category: utilities",
      "  summary: A demo skill",
      "  version: 1.2.3",
      "---",
      "",
      "# demo",
      "",
    ].join("\n"),
  };

  it("links a plugin's CHANGELOG.md when it has one", () => {
    const content = loadContent(checkout({ ...PLUGIN, "apps/demo/CHANGELOG.md": "# Changelog\n" }));
    expect(content.plugins[0]?.changelog).toBe("apps/demo/CHANGELOG.md");
  });

  it("has no changelog to link for a plugin without the file", () => {
    const content = loadContent(checkout(PLUGIN));
    expect(content.plugins[0]?.changelog).toBeUndefined();
  });

  it("says how finished a plugin and a skill are from the version alone", () => {
    const at = (version: string) =>
      loadContent(
        checkout({
          "apps/demo/package.json": PLUGIN["apps/demo/package.json"]!.replace("1.2.3", version),
          "apps/demo/README.md": PLUGIN["apps/demo/README.md"]!,
          "skills/demo/SKILL.md": SKILL["skills/demo/SKILL.md"]!.replace("1.2.3", version),
        }),
      );
    for (const [version, tier] of [
      ["0.0.4", "unfinished"],
      ["0.3.0", "pre-release"],
      ["1.2.3", "release"],
    ] as const) {
      const content = at(version);
      expect(content.plugins[0]?.tier, version).toBe(tier);
      expect(content.skills[0]?.tier, version).toBe(tier);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses the status flag the version replaced, on a plugin and on a skill", () => {
    const flagged = PLUGIN["apps/demo/README.md"]!.replace(
      "order: 1",
      "order: 1\nstatus: in-progress",
    );
    expect(() => loadContent(checkout({ ...PLUGIN, "apps/demo/README.md": flagged }))).toThrow(
      /drop `status`/,
    );
    rmSync(root, { recursive: true, force: true });
    const skill = SKILL["skills/demo/SKILL.md"]!.replace(
      "  version: 1.2.3",
      "  version: 1.2.3\n  status: in-progress",
    );
    expect(() => loadContent(checkout({ "skills/demo/SKILL.md": skill }))).toThrow(
      /drop `metadata.status`/,
    );
  });

  it("offers a skill install at its release tag", () => {
    const content = loadContent(checkout(SKILL));
    expect(content.skills[0]?.pinnedInstall).toBe(
      "npx skills add 'nickolaj-jepsen/agents#demo--v1.2.3' --skill demo",
    );
  });

  it("installs a skill and a pi package from the dist branch, where the released versions are", () => {
    const content = loadContent(checkout({ ...PLUGIN, ...SKILL }));
    expect(content.skills[0]?.install).toEqual([
      "npx skills add 'nickolaj-jepsen/agents#dist' --skill demo",
    ]);
    expect(content.plugins[0]?.install.pi).toContain("--branch dist");
    expect(content.plugins[0]?.install.pi).toContain("pi install ./agents/demo");
  });

  it("links a skill's changelog and keeps it out of the files the skill installs", () => {
    const content = loadContent(
      checkout({
        ...SKILL,
        "skills/demo/CHANGELOG.md": "# Changelog\n",
        "skills/demo/ref.md": "x\n",
      }),
    );
    expect(content.skills[0]?.changelog).toBe("skills/demo/CHANGELOG.md");
    expect(content.skills[0]?.files).toEqual(["ref.md"]);
  });
});
