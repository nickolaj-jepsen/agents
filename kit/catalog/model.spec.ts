import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { here, loadModel, markdown, type Model } from "./model.ts";

// The same checks as `npm run catalog -- --check`; none of them needs a PNG or the network.
// Reading the kits' source with the compiler is slow on a cold build, hence the timeout.
describe("component manifests", () => {
  let model: Model;
  beforeAll(async () => {
    model = await loadModel();
  }, 120_000);

  it("agree with the kits and the stories", () => {
    expect(model.problems).toEqual([]);
  });

  it("match the committed COMPONENTS.md", () => {
    const committed = readFileSync(join(here, "COMPONENTS.md"), "utf8");
    expect(markdown(model), "run `npm run catalog -- --no-shots`").toBe(committed);
  });
});
