import { describe, expect, test } from "vitest";
import { textOf, widthOf } from "../lines.ts";
import type { List, ListGroup } from "./contract.ts";
import { listStories } from "./stories.ts";
import { cutLeft, list, listFollow, listShowsWhole, listTopMax } from "./terminal.ts";

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
    active: Math.floor(focus / per) === g,
    rows: Array.from({ length: per }, (_, r) => ({
      text: `Row ${g * per + r}`,
      focused: g * per + r === focus,
      hit: `row:${g * per + r}`,
      markHit: `mark:${g * per + r}`,
    })),
  }));

describe("a list", () => {
  test("lines a group's label up with its rows' pointer, behind the card's rail", () => {
    const rows = list({ groups: groups(1, 1) }, 40).map(textOf);
    expect(rows).toEqual(["│  docs/page-0.md", "│    ○ Row 0", "│  ❯ ○ Row 1", "│    ○ Row 2"]);
  });

  test("keeps the aside column on every row, so the cut text lines up", () => {
    const l: List = {
      aside: 3,
      groups: [
        {
          label: "a.md",
          rows: [
            { text: "x".repeat(80), aside: "3×" },
            { text: "y".repeat(80) },
            { text: "short" },
          ],
        },
      ],
    };
    const [, one, two, three] = list(l, 48).map(textOf);
    expect(one).toMatch(/…   3×$/);
    expect(two!.indexOf("…")).toBe(one!.indexOf("…"));
    expect(three!.trimEnd()).toBe("│    ○ short");
    expect(listShowsWhole("short", 48, 3)).toBe(true);
    expect(listShowsWhole("x".repeat(80), 48, 3)).toBe(false);
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
        aside: 3,
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

  test("a row's pointer column and mark are a control apart from its text", () => {
    const [, row] = list({ groups: groups(0, 1, 1) }, 40);
    const at = (hit: string) =>
      row!.spans
        .filter((s) => s.hit === hit)
        .map((s) => s.text)
        .join("");
    expect(at("mark:0")).toBe("❯ ○ ");
    expect(at("row:0")).toContain("Row 0");
    expect(row!.hit).toBeUndefined();
  });

  test("a group's controls sit at its row's right, dim, bold under the mouse", () => {
    const [head] = list(
      {
        groups: [
          {
            label: "docs/a.md",
            hit: "doc",
            actions: [
              { label: "Apply all", hit: "all:apply", hovered: true },
              { label: "Dismiss all", hit: "all:dismiss" },
            ],
            rows: [],
          },
        ],
      },
      50,
    );
    expect(textOf(head!)).toMatch(/^│  docs\/a\.md +Apply all  Dismiss all$/);
    expect(head!.spans.find((s) => s.hit === "all:apply")).toMatchObject({
      role: "text",
      bold: true,
    });
    expect(head!.spans.find((s) => s.hit === "all:dismiss")).toMatchObject({ role: "dim" });
  });

  test("cuts a path from the left, whole folders first", () => {
    expect(cutLeft("skills/agent-plugin-dev/references/style.md", 24)).toBe(
      "…/references/style.md",
    );
    expect(cutLeft("a-very-long-file-name.md", 10)).toBe("…e-name.md");
  });
});

describe("a window", () => {
  const at = (focus: number, top: number, height = 7): List => ({
    groups: groups(focus),
    height,
    top,
    noun: ["doc", "docs"],
  });

  test("says what it hides above and below, suggestions and docs alike", () => {
    const rows = list(at(7, 5), 50).map(textOf);
    expect(rows).toHaveLength(7);
    expect(rows.at(-1)).toBe("   ↑ 3 in 1 doc  ↓ 7 in 3 docs");
  });

  test("moves only when the keyboard would leave it, keeping two rows round it", () => {
    let top = 0;
    const tops: number[] = [];
    for (let f = 0; f < 15; f++) {
      top = listFollow(at(f, top));
      tops.push(top);
    }
    // Down the list it holds still until the keyboard is two rows from its foot.
    expect(tops.slice(0, 3)).toEqual([0, 0, 0]);
    expect(new Set(tops).size).toBeGreaterThan(3);
    for (let f = 1; f < 15; f++) expect(tops[f]! - tops[f - 1]!).toBeLessThanOrEqual(2);
    // Back up, it holds still again until the keyboard is two rows from its head.
    expect(listFollow(at(12, top))).toBe(top);
  });

  test("the keyboard's group row stands in for its first row, and nothing else moves", () => {
    // From entry 5 (Row 3) the window would open on a row of the keyboard's doc.
    const stood = list(at(4, 5), 50).map(textOf);
    const below = list(at(4, 4), 50).map(textOf);
    expect(stood[0]).toContain("docs/page-1.md");
    expect(stood[1]).toContain("❯ ○ Row 4");
    // Every row under the first stays where the window from entry 5 puts it.
    expect(stood.slice(1, 5)).toEqual(below.slice(2, 6));
  });

  test("a group row is never the window's last without one of its rows", () => {
    // Top 1: Row 0, 1, 2, then page-1's row, then Row 3 ... the sixth row would be page-2's.
    const rows = list({ ...at(0, 2), height: 7 }, 50).map(textOf);
    expect(rows[5]).not.toMatch(/docs\/page/);
  });

  test("of one row, it is the keyboard's alone; of two, no more-row", () => {
    expect(
      list({ ...at(4, listFollow({ ...at(4, 0), height: 1 })), height: 1 }, 50).map(textOf),
    ).toEqual(["│  ❯ ○ Row 4"]);
    expect(list({ ...at(0, 0), height: 2 }, 50)).toHaveLength(2);
  });

  test("flat, each row carries its doc and there are no group rows", () => {
    const rows = list({ ...at(4, 0), flat: true, height: 3 }, 50).map(textOf);
    expect(rows[0]).toBe("│    ○ docs/page-0.md › Row 0");
    expect(rows.at(-1)).toMatch(/↓ 13 in 5 docs/);
  });

  test("its top stays within the list", () => {
    expect(listTopMax(at(0, 0))).toBe(20 - 6);
    expect(list(at(0, 99), 50)).toEqual(list(at(0, listTopMax(at(0, 0))), 50));
  });
});
