import { describe, expect, test } from "vitest";
import { textOf, widthOf } from "@agents/kit-core/lines.ts";
import { proseStories } from "./stories.ts";
import { prose } from "./terminal.ts";

describe("prose", () => {
  test.each(proseStories.map((s) => ({ id: `${s.component}/${s.state}`, story: s })))(
    "$id fits every width",
    ({ story }) => {
      for (let width = 24; width <= 130; width++)
        for (const l of prose({ ...story.model, width }))
          expect(widthOf(l), `${width}: ${textOf(l)}`).toBeLessThanOrEqual(width);
    },
  );
});
