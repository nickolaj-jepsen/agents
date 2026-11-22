import { describe, expect, test } from "vitest";
import { textOf, widthOf } from "../lines.ts";
import { sheetStories } from "./stories.ts";

describe("every sheet story", () => {
  test.each(sheetStories.map((s) => ({ id: `${s.component}/${s.state}`, story: s })))(
    "$id fits every width",
    ({ story }) => {
      for (let width = 24; width <= 130; width++)
        for (const l of story.lines(width))
          expect(widthOf(l), `${width}: ${textOf(l)}`).toBeLessThanOrEqual(width);
    },
  );
});
