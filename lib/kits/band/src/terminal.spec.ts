import { describe, expect, test } from "vitest";
import { textOf, widthOf } from "@agents/kit-core/lines.ts";
import { statusBand } from "./terminal.ts";

describe("the status band's line", () => {
  const band = {
    text: "spellfix: 3 typos in this very long line of words",
    hint: "review",
    hit: "open",
  };

  test("fits every width, with the hint whole", () => {
    for (let width = 24; width <= 130; width++)
      for (const l of statusBand({ ...band, width }))
        expect(widthOf(l), `${width}: ${textOf(l)}`).toBeLessThanOrEqual(width);
  });
});
