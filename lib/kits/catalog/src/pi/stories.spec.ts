import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { stories, storyId } from "./stories.ts";

const theme = {
  fg: (_c: string, t: string) => t,
  bold: (t: string) => t,
  underline: (t: string) => t,
} as unknown as Theme;

describe("catalogue stories", () => {
  it("have unique component/state ids and a caption", () => {
    const ids = stories.map(storyId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of stories) expect(s.about.length).toBeGreaterThan(0);
  });
  it("never draw wider than they are given, at any width", () => {
    for (const s of stories)
      for (const width of [40, 68, 96, 124]) {
        const lines = s.make().render(theme, width, { columns: width + 2, rows: 24 });
        for (const line of lines)
          expect(visibleWidth(line), `${storyId(s)} at ${width}`).toBeLessThanOrEqual(width);
      }
  });
});
