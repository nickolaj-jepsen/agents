import { describe, expect, test } from "vitest";
import { textOf, widthOf } from "../lines.ts";
import type { ListGroup } from "./contract.ts";
import { listStories } from "./stories.ts";
import { cutLeft, list, listRange, listShowsWhole } from "./terminal.ts";

describe("every list story", () => {
  test.each(listStories.map((s) => ({ id: `${s.component}/${s.state}`, story: s })))(
    "$id fits every width",
    ({ story }) => {
      for (let width = 24; width <= 130; width++)
        for (const l of story.lines(width))
          expect(widthOf(l), `${width}: ${textOf(l)}`).toBeLessThanOrEqual(width);
    },
  );
});

const groups = (focus: number, count = 5, per = 3): ListGroup[] =>
  Array.from({ length: count }, (_, g) => ({
    label: `docs/page-${g}.md`,
    count: String(per),
    active: Math.floor(focus / per) === g,
    rows: Array.from({ length: per }, (_, r) => ({
      text: `Row ${g * per + r}`,
      focused: g * per + r === focus,
      hit: `row:${g * per + r}`,
    })),
  }));

describe("a list", () => {
  test("lines a group's label up with its rows' pointer, behind the card's rail", () => {
    const rows = list({ groups: groups(1, 1) }, 40).map(textOf);
    expect(rows[0]).toMatch(/^│  docs\/page-0\.md +3$/);
    expect(rows[0]).toHaveLength(40);
    expect(rows.slice(1)).toEqual(["│    ○ Row 0", "│  ❯ ○ Row 1", "│    ○ Row 2"]);
  });

  test("marks a chosen row in the accent and a dropped one dim, the whole row", () => {
    const [, chosen, dropped] = list(
      {
        groups: [
          {
            label: "a.md",
            rows: [
              { text: "Kept `code` too", mark: "chosen" },
              { text: "Set aside", mark: "dropped", aside: "2×" },
            ],
          },
        ],
      },
      60,
    );
    expect(textOf(chosen!)).toContain("● Kept code too");
    for (const sp of chosen!.spans.filter((s) => /Kept|code|too/.test(s.text)))
      expect(sp).toMatchObject({ role: "accent", bold: true });
    expect(textOf(dropped!)).toMatch(/– Set aside +2×$/);
    for (const sp of dropped!.spans.slice(1).filter((s) => s.text.trim()))
      expect(sp.role, sp.text).toBe("dim");
  });

  test("drops the aside before the text loses more room", () => {
    const one = (width: number) =>
      textOf(
        list(
          { groups: [{ label: "a.md", rows: [{ text: "x".repeat(80), aside: "3×" }] }] },
          width,
        )[1]!,
      );
    expect(one(60)).toMatch(/…  3×$/);
    expect(one(48)).not.toContain("3×");
    expect(listShowsWhole("short", 48, "3×")).toBe(true);
    expect(listShowsWhole("x".repeat(80), 48)).toBe(false);
  });

  test("cuts a path from the left, whole folders first", () => {
    expect(cutLeft("skills/agent-plugin-dev/references/style.md", 24)).toBe(
      "…/references/style.md",
    );
    expect(cutLeft("a-very-long-file-name.md", 10)).toBe("…e-name.md");
  });

  test("a window keeps the keyboard's group on top and says what it hides", () => {
    const rows = list({ groups: groups(7), height: 6, noun: ["doc", "docs"] }, 50).map(textOf);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toContain("docs/page-2.md");
    expect(rows.some((r) => r.includes("❯ ○ Row 7"))).toBe(true);
    expect(rows.at(-1)).toBe("   ↑ 2 docs above  ↓ 3 more here · 1 more doc");
  });

  test("the group row stays on top of rows it scrolls past", () => {
    const rows = list({ groups: groups(5, 2, 6), height: 4 }, 50).map(textOf);
    expect(rows[0]).toContain("docs/page-0.md");
    expect(rows[2]).toContain("❯ ○ Row 5");
    expect(rows[3]).toContain("↑ 4 more here");
  });

  test("a window of one row is the keyboard's", () => {
    expect(list({ groups: groups(4), height: 1 }, 50).map(textOf)).toEqual(["│  ❯ ○ Row 4"]);
  });

  test("scroll moves the window within its range, not the keyboard", () => {
    const l = { groups: groups(0), height: 6 };
    const range = listRange(l);
    expect(range.min).toBe(0);
    const end = list({ ...l, scroll: range.max }, 50).map(textOf);
    expect(end.some((r) => r.includes("Row 14"))).toBe(true);
    expect(end.some((r) => r.includes("❯"))).toBe(false);
    expect(list({ ...l, scroll: range.max + 10 }, 50)).toEqual(
      list({ ...l, scroll: range.max }, 50),
    );
  });
});
