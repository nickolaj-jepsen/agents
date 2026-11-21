import { describe, expect, test } from "vitest";
import { textOf, widthOf } from "../lines.ts";
import type { Detail } from "./contract.ts";
import { detailStories } from "./stories.ts";
import { detail, detailRange } from "./terminal.ts";

describe("every detail story", () => {
  test.each(detailStories.map((s) => ({ id: `${s.component}/${s.state}`, story: s })))(
    "$id fits every width",
    ({ story }) => {
      for (let width = 24; width <= 130; width++)
        for (const l of story.lines(width))
          expect(widthOf(l), `${width}: ${textOf(l)}`).toBeLessThanOrEqual(width);
    },
  );
});

const ITEM: Detail = {
  meta: "wrong · seen 3×",
  title: "A title that wraps onto a second row",
  sections: [
    { heading: "Why", text: "One.\nTwo." },
    {
      items: [
        { key: "path", value: "a/b.nix" },
        { key: "quote", value: "said so", isQuote: true },
      ],
    },
  ],
};

describe("a detail", () => {
  test("is a dim meta line, a bold title, and sections a blank row apart", () => {
    const rows = detail(ITEM, 24);
    expect(rows.map(textOf)).toEqual([
      "wrong · seen 3×",
      "A title that wraps onto",
      "a second row",
      "",
      "Why",
      "One.",
      "Two.",
      "",
      "path   a/b.nix",
      "quote  “said so”",
    ]);
    expect(rows[0]!.spans[0]).toMatchObject({ role: "dim" });
    expect(rows[1]!.spans[0]).toMatchObject({ role: "text", bold: true });
    expect(rows[4]!.spans[0]).toMatchObject({ role: "dim" });
  });

  test("cut to a height ends in a dim ↓ more; scrolled, it starts with ↑ more", () => {
    const cut = detail({ ...ITEM, height: 4 }, 24).map(textOf);
    expect(cut).toEqual(["wrong · seen 3×", "A title that wraps onto", "a second row", "↓ more"]);
    const max = detailRange({ ...ITEM, height: 4 }, 24);
    const end = detail({ ...ITEM, height: 4, offset: max }, 24).map(textOf);
    expect(end).toEqual(["↑ more", "", "path   a/b.nix", "quote  “said so”"]);
    expect(detail({ ...ITEM, height: 4, offset: max + 5 }, 24)).toEqual(
      detail({ ...ITEM, height: 4, offset: max }, 24),
    );
  });

  test("a rule carries its words and a control at its end; every other row is the detail's", () => {
    const rows = detail(
      {
        sections: [
          { rule: "Evidence 1 of 2", action: { label: "Next", hotkey: "n", hit: "next" } },
        ],
        hit: "open",
      },
      40,
    );
    expect(textOf(rows[0]!)).toBe("Evidence 1 of 2 ─────────────── Next [n]");
    expect(rows[0]!.hit).toBeUndefined();
    expect(
      rows[0]!.spans
        .filter((s) => s.hit === "next")
        .map((s) => s.text)
        .join(""),
    ).toBe("Next [n]");
    expect(detail({ meta: "m", hit: "open" }, 40)[0]!.hit).toBe("open");
  });
});
