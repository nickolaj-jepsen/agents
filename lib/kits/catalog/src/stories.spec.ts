import { describe, expect, test } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { textOf, widthOf } from "@agents/kit-core/lines.ts";
import { paintLines } from "@agents/kit-core/paint/pi.ts";
import { hasTerminalStory, storyId } from "@agents/kit-core/stories.ts";
import { kitStories } from "./registry.ts";

const plain = {
  fg: (_c: string, t: string) => t,
  bold: (t: string) => t,
  italic: (t: string) => t,
  underline: (t: string) => t,
} as never;

describe("every kit story", () => {
  test.each(kitStories.filter(hasTerminalStory).map((s) => ({ id: storyId(s), story: s })))(
    "$id fits every width, by the kit's measure and by pi's",
    ({ story }) => {
      for (let width = 24; width <= 130; width++) {
        const lines = story.lines(width);
        for (const l of lines)
          expect(widthOf(l), `${width}: ${textOf(l)}`).toBeLessThanOrEqual(width);
        for (const painted of paintLines(plain, lines, width).lines)
          expect(visibleWidth(painted), `${width}: ${painted}`).toBeLessThanOrEqual(width);
      }
    },
  );

  test("pi's measure has the last word: a line it counts wider is cut", () => {
    const [cut] = paintLines(plain, [{ spans: [{ text: "x".repeat(50) }] }], 20).lines;
    expect(visibleWidth(cut ?? "")).toBe(20);
  });
});
