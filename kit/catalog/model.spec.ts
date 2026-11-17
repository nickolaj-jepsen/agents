import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { here, loadModel, markdown, type Model } from "./model.ts";

// As `npm run components -- --check`: no picture, no network.
describe("component manifests", () => {
  let model: Model;
  beforeAll(async () => {
    model = await loadModel();
  });

  it("agree with the kits and the stories", () => {
    expect(model.problems).toEqual([]);
  });

  it("match the committed COMPONENTS.md", () => {
    const committed = readFileSync(join(here, "COMPONENTS.md"), "utf8");
    expect(markdown(model), "run `npm run components`").toBe(committed);
  });
});
