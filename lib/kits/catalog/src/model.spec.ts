import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { here, loadModel, markdown, repoRoot, withIndex, type Model } from "./model.ts";

// As `turbo run catalog -- --check`: no PNG, no network. The compiler reading the kits is slow on a
// cold build, hence the timeout.
describe("component manifests", () => {
  let model: Model;
  beforeAll(async () => {
    model = await loadModel();
  }, 120_000);

  it("agree with the kits and the stories", () => {
    expect(model.problems).toEqual([]);
  });

  it("match the committed COMPONENTS.md", () => {
    const committed = readFileSync(join(here, "..", "COMPONENTS.md"), "utf8");
    expect(markdown(model), "run `turbo run catalog -- --no-shots`").toBe(committed);
  });

  it("match the kit index in AGENTS.md", () => {
    const agents = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
    expect(withIndex(agents, model), "run `turbo run catalog -- --no-shots`").toBe(agents);
  });
});
