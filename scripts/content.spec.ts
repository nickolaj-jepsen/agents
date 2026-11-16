import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORIES, loadContent, repoRoot } from "./content.ts";

const content = loadContent();

describe("content", () => {
  it("has a plugin for every plugin folder, with a README", () => {
    const folders = readdirSync(join(repoRoot, "plugins"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(content.plugins.map((p) => p.name).sort()).toEqual(folders.sort());
    for (const p of content.plugins) {
      expect(existsSync(join(repoRoot, p.path, "README.md"))).toBe(true);
      expect(p.harness.claude || p.harness.pi).toBe(true);
    }
  });

  it("orders plugins uniquely", () => {
    const orders = content.plugins.map((p) => p.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("gives every skill a summary and a known category", () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    for (const s of content.skills) {
      expect(s.summary).not.toBe("");
      expect(slugs).toContain(s.category);
    }
    expect(content.categories.flatMap((c) => c.skills)).toHaveLength(content.skills.length);
  });

  it("lists in-progress skills last", () => {
    expect(content.categories.at(-1)?.slug).toBe("in-progress");
    for (const s of content.categories.at(-1)?.skills ?? []) expect(s.status).toBe("in-progress");
  });

  it("gives every doc a title", () => {
    expect(content.docs.length).toBeGreaterThan(0);
    for (const d of content.docs) expect(d.title).not.toBe("");
  });
});
