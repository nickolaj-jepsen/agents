import { describe, expect, test } from "vitest";
import { surfaceNames } from "@agents/kit-core/surfaces.ts";
import type { List } from "./contract.ts";
import { view } from "./model.ts";

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    text: `Row ${i}`,
    hit: `row:${i}`,
    icon: "kind:stale" as const,
    mark: "chosen" as const,
  }));

describe("the list's view model", () => {
  test("a row's meaning replaces its mark on a graphical surface, and a terminal keeps the mark", () => {
    const l: List = { groups: [{ label: "a", rows: rows(1) }] };
    for (const s of surfaceNames) {
      const lead = view(l, s).groups[0]?.rows[0]?.lead;
      const isGui = s === "vscode" || s === "desktop" || s === "mobile";
      expect(lead, s).toEqual(isGui ? { meaning: "kind:stale" } : { mark: "chosen" });
    }
  });

  test("a row that says no mark has no lead at all", () => {
    const l: List = {
      groups: [{ label: "", rows: [{ text: "x", mark: "none", icon: "kind:wrong" }] }],
    };
    expect(view(l, "vscode").groups[0]?.rows[0]?.lead).toBeUndefined();
  });

  test("a capped group's control reads Show N more, and an opened row stays in view", () => {
    const l: List = {
      groups: [{ label: "a", rows: rows(6) }],
      maxItems: 2,
      more: { isAll: false, hit: "more" },
      opened: { "row:5": "detail" },
    };
    const g = view(l, "vscode").groups[0];
    expect(g?.rows.map((r) => r.text)).toEqual(["Row 0", "Row 1", "Row 5"]);
    expect(g?.more).toEqual({ hit: "more", label: "Show 3 more" });
    expect(g?.rows[2]?.action?.label).toBe("Close");
    // A terminal has a window instead: nothing is capped.
    expect(view(l, "pi").groups[0]?.rows).toHaveLength(6);
    expect(view(l, "pi").groups[0]?.more).toBeUndefined();
  });

  test("a terminal row is the control: it has no Button", () => {
    const l: List = { groups: [{ label: "a", rows: rows(1) }] };
    expect(view(l, "pi").groups[0]?.rows[0]?.action).toBeUndefined();
    expect(view(l, "vscode").groups[0]?.rows[0]?.action).toEqual({ hit: "row:0", label: "Open" });
  });

  test("a count or a time goes in the shared column, a word follows the text", () => {
    const l: List = {
      groups: [
        {
          label: "a",
          rows: [
            { text: "x", aside: "3×" },
            { text: "y", aside: "15h" },
            { text: "z", aside: "github.com" },
          ],
        },
      ],
    };
    const v = view(l, "vscode");
    expect(v.groups[0]?.rows.map((r) => r.asideIn)).toEqual(["column", "column", "text"]);
    expect(v.asideCells).toBe(3);
    expect(view(l, "pi").groups[0]?.rows[0]?.asideIn).toBeUndefined();
  });
});
