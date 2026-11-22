// Cross-file checks that belong to no one package. The kit's own are in its specs:
// `lib/kits/catalog/src/model.spec.ts` (COMPONENTS.md and the kit index in AGENTS.md match the
// manifests); `content.spec.ts` holds that every plugin has a README.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./content.ts";
import { checkReadme } from "./readme.ts";

const apps = join(repoRoot, "apps");

/** The apps with a Claude half (a `claude` field in package.json): the ones the marketplace can publish. */
function claudePlugins(): string[] {
  return readdirSync(apps, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() &&
        "claude" in JSON.parse(readFileSync(join(apps, e.name, "package.json"), "utf8")),
    )
    .map((e) => e.name)
    .sort();
}

describe(".claude-plugin/marketplace.json", () => {
  const file = join(repoRoot, ".claude-plugin/marketplace.json");
  const { plugins: entries } = JSON.parse(readFileSync(file, "utf8")) as {
    plugins: { name: string; source: string }[];
  };
  // `skills` is the other entry: it discovers `skills/` without a per-skill list.
  const published = entries.filter((p) => p.name !== "skills");

  it("lists every plugin that has a Claude half, at ./apps/<name>", () => {
    const listed = new Map(published.map((p) => [p.name, p.source]));
    const missing = claudePlugins().filter((name) => listed.get(name) !== `./apps/${name}`);
    expect(
      missing,
      `add { "name": "<name>", "source": "./apps/<name>" } to .claude-plugin/marketplace.json for: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("lists only plugins that have a Claude half", () => {
    const halves = new Set(claudePlugins());
    const stray = published.filter((p) => !halves.has(p.name)).map((p) => p.name);
    expect(
      stray,
      `remove from .claude-plugin/marketplace.json, or add a `claude` field to apps/<name>/package.json: ${stray.join(", ")}`,
    ).toEqual([]);
  });

  it("lists each plugin once", () => {
    const names = entries.map((p) => p.name);
    const twice = names.filter((name, i) => names.indexOf(name) !== i);
    expect(twice, "an entry of .claude-plugin/marketplace.json is repeated").toEqual([]);
  });

  it("keeps the skills entry, sourced from the repo root", () => {
    expect(
      entries.find((p) => p.name === "skills")?.source,
      'add { "name": "skills", "source": "./", "strict": false } to .claude-plugin/marketplace.json',
    ).toBe("./");
  });
});

describe("README.md", () => {
  it("is the generator's output: run `pnpm turbo run build` after editing a plugin or skill README, docs/_intro.md or docs/_install.md", () => {
    expect(checkReadme().join("\n")).toBe("");
  });
});
