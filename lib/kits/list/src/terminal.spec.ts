import { describe, expect, test } from "vitest";
import { textOf } from "@agents/kit-core/lines.ts";
import type { List, ListGroup } from "./contract.ts";
import {
  cutLeft,
  list,
  listFollow,
  listRows,
  listShowsWhole,
  listTextRoom,
  listTopMax,
} from "./terminal.ts";

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

describe("keys and disabled rows", () => {
  const menu: List = {
    rail: false,
    aside: 12,
    groups: [
      {
        label: "Actions",
        active: true,
        rows: [
          { text: "Commit", key: "1", mark: "none", hit: "a" },
          { text: "Land", key: "2", mark: "none", aside: "no worktree", disabled: true, hit: "b" },
          { text: "No key", mark: "none", hit: "c" },
        ],
      },
    ],
  };

  test("a group with no label draws no group row", () => {
    const bare: List = { ...menu, groups: [{ ...menu.groups[0]!, label: "" }] };
    const rows = list(bare, 40).map((l) => textOf(l).trimEnd());
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe("  1 Commit");
    expect(listRows(bare, 40)).toBe(3);
  });

  test("a literal row keeps its underscores and stars", () => {
    const row = { text: "notes/_old_/a*b*.md", mark: "none" as const };
    const read = (literal: boolean) =>
      textOf(list({ groups: [{ label: "", rows: [{ ...row, literal }] }], rail: false }, 40)[0]!);
    expect(read(true).trim()).toBe("notes/_old_/a*b*.md");
    expect(read(false).trim()).not.toBe("notes/_old_/a*b*.md");
  });

  test("draws a key before the text, the column the widest key's, with no mark cell when every row has none", () => {
    const rows = list(menu, 40).map((l) => textOf(l).trimEnd());
    expect(rows[0]).toBe("Actions");
    expect(rows[1]).toBe("  1 Commit");
    expect(rows[2]).toMatch(/^ {2}2 Land +no worktree$/);
    expect(rows[3]).toBe("    No key");
  });

  test("a disabled row is dim and no control, its key dim too", () => {
    const rows = list(menu, 40);
    expect(rows[1]!.hit).toBe("a");
    expect(rows[2]!.hit).toBeUndefined();
    expect(rows[2]!.spans.some((s) => s.hit)).toBe(false);
    expect(rows[2]!.spans.filter((s) => s.text.trim()).every((s) => s.role === "dim")).toBe(true);
    expect(rows[1]!.spans.find((s) => s.text === "1")!.role).toBe("accent");
  });

  test("the key and its space are cells the text does not have", () => {
    const keyed = listTextRoom(40, menu);
    expect(listTextRoom(40, { aside: 12, rail: false })).toBe(keyed);
    expect(
      listTextRoom(40, {
        aside: 12,
        rail: false,
        groups: [{ label: "g", rows: [{ text: "a", key: "1" }] }],
      }),
    ).toBe(keyed - 2);
    expect(listShowsWhole("x".repeat(keyed), 40, menu)).toBe(true);
    expect(listShowsWhole("x".repeat(keyed + 1), 40, menu)).toBe(false);
  });

  test("a list with some marks keeps the mark column beside a none row", () => {
    const l: List = {
      rail: false,
      groups: [{ label: "g", rows: [{ text: "a", mark: "none" }, { text: "b" }] }],
    };
    expect(list(l, 20).map(textOf)).toEqual(["g", "    a", "  ○ b"]);
  });
});

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
    expect(listShowsWhole("short", 48, { aside: 3 })).toBe(true);
    expect(listShowsWhole("x".repeat(80), 48, { aside: 3 })).toBe(false);
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
              { label: "Apply all", hotkey: "", hit: "all:apply", hovered: true },
              { label: "Dismiss all", hotkey: "", hit: "all:dismiss" },
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

describe("rows of several lines", () => {
  const long = (n: number) => `Row ${n} with a text long enough to take a second line and a third`;
  const wrapped = (focus: number, extra: Partial<List> = {}): List => ({
    aside: 3,
    lines: 2,
    groups: Array.from({ length: 3 }, (_, g) => ({
      label: `docs/page-${g}.md`,
      active: Math.floor(focus / 2) === g,
      rows: [0, 1].map((r) => ({
        text: r ? `Row ${g * 2 + r}` : long(g * 2),
        aside: r ? "" : "2×",
        focused: g * 2 + r === focus,
        hit: `row:${g * 2 + r}`,
        markHit: `mark:${g * 2 + r}`,
      })),
    })),
    ...extra,
  });

  test("a text wraps under its first line, cut at the last; the mark and the aside are the first's", () => {
    const rows = list(wrapped(0), 44);
    expect(rows.slice(0, 4).map(textOf)).toEqual([
      "│  docs/page-0.md",
      "│  ❯ ○ Row 0 with a text long enough to   2×",
      "│      take a second line and a third",
      "│    ○ Row 1                                ",
    ]);
    expect(textOf(list(wrapped(0), 36)[2]!)).toBe("│      enough to take a second…");
    // The second line is the row's control, and not its mark's.
    expect(rows[2]!.spans.filter((s) => s.hit).map((s) => s.hit)).toEqual(["row:0"]);
    expect(listShowsWhole(long(0), 44, { aside: 3, lines: 2 })).toBe(true);
    expect(listShowsWhole(long(0), 36, { aside: 3, lines: 2 })).toBe(false);
    // Without rails the text has their cells too.
    expect(listShowsWhole(long(0), 41, { aside: 3, lines: 2, rail: false })).toBe(true);
    expect(listShowsWhole(long(0), 41, { aside: 3, lines: 2 })).toBe(false);
    expect(listShowsWhole(long(0), 44, { aside: 3 })).toBe(false);
  });

  test("a list's rows are its lines, and one line a row without `lines`", () => {
    expect(listRows(wrapped(0), 44)).toBe(12);
    expect(listRows({ ...wrapped(0), lines: 1 }, 44)).toBe(9);
    expect(list({ ...wrapped(0), lines: 1 }, 44)).toHaveLength(9);
    // Flat rows are for little room: one line each.
    expect(list({ ...wrapped(0), flat: true }, 44)).toHaveLength(6);
  });

  test("a window ends a row it cuts in `…`, and counts a row once", () => {
    const rows = list(wrapped(0, { height: 6 }), 44).map(textOf);
    expect(rows).toEqual([
      "│  docs/page-0.md",
      "│  ❯ ○ Row 0 with a text long enough to   2×",
      "│      take a second line and a third",
      "│    ○ Row 1                                ",
      "",
      "   ↓ 4 more",
    ]);
    const cut = list(wrapped(0, { height: 7 }), 44).map(textOf);
    expect(cut[4]).toBe("│  docs/page-1.md");
    expect(cut[5]).toBe("│    ○ Row 2 with a text long enough t…   2×");
    expect(cut[6]).toBe("   ↓ 3 more");
  });

  test("a window opens on a row's first line, and keeps every line of the keyboard's row", () => {
    // Line 2 is the end of Row 0: the window opens on Row 1 instead.
    expect(textOf(list(wrapped(1, { height: 5, top: 2 }), 44)[0]!)).toContain("Row 1");
    let top = 0;
    for (let focus = 0; focus < 6; focus++) {
      top = listFollow(wrapped(focus, { height: 6, top }), 44);
      const rows = list(wrapped(focus, { height: 6, top }), 44).map(textOf);
      const at = rows.findIndex((r) => r.includes("❯"));
      expect(at, `row ${focus}`).toBeGreaterThanOrEqual(0);
      if (focus % 2 === 0) expect(rows[at + 1], `row ${focus}`).toMatch(/^│ {6}take a second/);
    }
    expect(listTopMax(wrapped(0, { height: 6 }), 44)).toBe(12 - 5);
  });

  test("the keyboard's group row stands on a row's first line: its lines under it are the row, cut", () => {
    // Top 5 is Row 2, of the keyboard's group, whose own row is above the window.
    const rows = list(wrapped(3, { height: 5, top: 5 }), 44).map(textOf);
    expect(rows[0]).toBe("│  docs/page-1.md");
    expect(rows[1]).toBe("│    ○ Row 2 with a text long enough t…   2×");
    expect(rows[2]).toContain("❯ ○ Row 3");
    expect(rows.at(-1)).toBe("   ↑ 2 more  ↓ 2 more");
  });
});

describe("a window", () => {
  const at = (focus: number, top: number, height = 7): List => ({
    groups: groups(focus),
    height,
    top,
  });

  test("says how many rows are above it and below", () => {
    const rows = list(at(7, 5), 50).map(textOf);
    expect(rows).toHaveLength(7);
    expect(rows.at(-1)).toBe("   ↑ 3 more  ↓ 7 more");
  });

  test("moves only when the keyboard would leave it, keeping two rows round it", () => {
    let top = 0;
    const tops: number[] = [];
    for (let f = 0; f < 15; f++) {
      top = listFollow(at(f, top), 50);
      tops.push(top);
    }
    // Down the list it holds still until the keyboard is two rows from its foot.
    expect(tops.slice(0, 3)).toEqual([0, 0, 0]);
    expect(new Set(tops).size).toBeGreaterThan(3);
    for (let f = 1; f < 15; f++) expect(tops[f]! - tops[f - 1]!).toBeLessThanOrEqual(2);
    // Back up, it holds still again until the keyboard is two rows from its head.
    expect(listFollow(at(12, top), 50)).toBe(top);
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
      list({ ...at(4, listFollow({ ...at(4, 0), height: 1 }, 50)), height: 1 }, 50).map(textOf),
    ).toEqual(["│  ❯ ○ Row 4"]);
    expect(list({ ...at(0, 0), height: 2 }, 50)).toHaveLength(2);
  });

  test("with space, a blank row between groups, which a window scrolls past and never opens on", () => {
    const l: List = { groups: groups(0, 3, 2), space: true };
    const whole = list(l, 50).map(textOf);
    expect(whole).toHaveLength(11);
    expect(whole[3]).toBe("");
    expect(whole[7]).toBe("");
    expect(listRows(l, 50)).toBe(11);
    // Where the keyboard is does not change it.
    expect(list({ ...l, groups: groups(5, 3, 2) }, 50)).toHaveLength(11);
    // One row short: a window, the blank rows lines of it like any other.
    const cut = list({ ...l, height: 10 }, 50).map(textOf);
    expect(cut.slice(0, 5)).toEqual(whole.slice(0, 5));
    expect(cut.at(-1)).toBe("   ↓ 2 more");
    // Line 3 is the blank one: the window opens on the group's row under it.
    expect(list({ ...l, height: 5, top: 3 }, 50).map(textOf)[0]).toBe("│  docs/page-1.md");
    // A flat list has no groups to set apart.
    expect(list({ ...l, flat: true }, 50)).toHaveLength(6);
  });

  test("without rails a group's label starts the row, and nothing marks a decided group", () => {
    const l: List = { groups: [{ ...groups(1, 1)[0]!, done: true }], rail: false };
    expect(list(l, 40).map(textOf)).toEqual([
      "docs/page-0.md",
      "  ○ Row 0",
      "❯ ○ Row 1",
      "  ○ Row 2",
    ]);
    const cut = list({ groups: groups(0), rail: false, height: 4 }, 40).map(textOf);
    expect(cut.at(-1)).toBe("↓ 13 more");
    const railed = list({ ...l, rail: true }, 40);
    expect(railed[0]!.spans[0]).toMatchObject({ text: "│", role: "success" });
    expect(
      list(l, 40)
        .flatMap((row) => row.spans)
        .some((sp) => sp.role === "success"),
    ).toBe(false);
  });

  test("flat, each row carries its doc and there are no group rows", () => {
    const rows = list({ ...at(4, 0), flat: true, height: 3 }, 50).map(textOf);
    expect(rows[0]).toBe("│    ○ docs/page-0.md › Row 0");
    expect(rows.at(-1)).toBe("   ↓ 13 more");
  });

  test("its top stays within the list", () => {
    expect(listTopMax(at(0, 0), 50)).toBe(20 - 6);
    expect(list(at(0, 99), 50)).toEqual(list(at(0, listTopMax(at(0, 0), 50)), 50));
  });
});
