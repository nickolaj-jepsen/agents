import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { pairs, root, strays } from "./copies.ts";

describe("a mod's copies of the kit", () => {
  it("are verbatim: run `pnpm turbo run kit-sync` after editing the kit, the legacy kit or kit/catalog/samples.ts", () => {
    for (const { source, file } of pairs())
      expect(readFileSync(file, "utf8"), relative(root, file)).toBe(readFileSync(source, "utf8"));
  });

  it("hold nothing the kit no longer has: `pnpm turbo run kit-sync` removes it", () => {
    expect(strays().map((file) => relative(root, file))).toEqual([]);
  });
});
