import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { pairs, root } from "./copies.ts";
import { alignRight, cellWidth, clamp, fit, noteText, rowsOf, widthCap } from "./ui.tsx";

describe("the copies", () => {
  it("are verbatim: run `just kit-sync` after editing kit/claude/ui.tsx or kit/catalog/samples.ts", () => {
    for (const { source, file } of pairs())
      expect(readFileSync(file, "utf8"), relative(root, file)).toBe(readFileSync(source, "utf8"));
  });
});

const text = "the quick brown fox jumps over the lazy dog";
const ends = (s: string, tail: string) => s.trimEnd().endsWith(tail);

describe("cellWidth", () => {
  it("counts wide characters twice and marks not at all", () => {
    expect(cellWidth("abc")).toBe(3);
    expect(cellWidth("日本語")).toBe(6);
    expect(cellWidth("ＡＢ")).toBe(4);
    expect(cellWidth("é")).toBe(1);
    expect(cellWidth("🙂")).toBe(2);
  });
  it("counts the style's glyphs one cell", () => {
    for (const g of ["❯", "□", "■", "○", "●", "…", "─", "✓", "×", "│", "╰", "▸", "↻"])
      expect(cellWidth(g), g).toBe(1);
  });
});

describe("clamp", () => {
  it("wraps without limit when given no options", () => {
    const lines = clamp(text, 10);
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.join(" ")).toBe(text);
  });
  it("one-line truncation fills the line before the ellipsis", () => {
    const [line, ...more] = clamp(text, 20, { min: 1, max: 1 });
    expect(more).toEqual([]);
    expect(line).toBe("the quick brown fox…");
    expect(cellWidth(line!)).toBe(20);
  });
  it("max cuts the last kept line full, not at the word break", () => {
    const lines = clamp(text, 12, { max: 2 });
    expect(lines).toHaveLength(2);
    expect(cellWidth(lines[1]!)).toBe(12);
    expect(ends(lines[1]!, "…")).toBe(true);
  });
  it("min pads with blank lines", () => {
    expect(clamp("short", 20, { min: 3 })).toEqual(["short", "", ""]);
  });
  it("target is a length: a narrow pane gets more lines than a wide one", () => {
    const long = "word ".repeat(40).trim();
    expect(clamp(long, 20, { target: 60 })).toHaveLength(3);
    expect(clamp(long, 60, { target: 60 })).toHaveLength(1);
    expect(clamp(long, 20, { target: 60, max: 2 })).toHaveLength(2);
    expect(clamp(long, 20, { target: 60, min: 4 })).toHaveLength(4);
  });
  it("short text under a target is not padded", () => {
    expect(clamp("hi", 10, { target: 100 })).toEqual(["hi"]);
  });
  it("measures cells: wide characters count two", () => {
    const lines = clamp("日本語のテキストが長い場合", 10, { min: 1, max: 2 });
    expect(lines).toHaveLength(2);
    expect(Math.max(...lines.map(cellWidth))).toBeLessThanOrEqual(10);
    expect(ends(lines[1]!, "…")).toBe(true);
  });
  it("cuts a word longer than the width", () => {
    const [line] = clamp("x".repeat(50), 10, { min: 1, max: 1 });
    expect(cellWidth(line!)).toBe(10);
    expect(ends(line!, "…")).toBe(true);
  });
  it("breaks a long word when it is not cut", () => {
    expect(clamp("x".repeat(25), 10)).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });
  it("is empty at no width or no lines", () => {
    expect(clamp("text", 0)).toEqual([]);
    expect(clamp("text", 10, { max: 0 })).toEqual([]);
  });
  it("keeps a newline as a line end", () => {
    expect(clamp("one\ntwo", 20)).toEqual(["one", "two"]);
  });
});

describe("text helpers", () => {
  it("fit pads and cuts in cells", () => {
    expect(fit("ab", 5)).toBe("ab   ");
    expect(fit("日本語", 5)).toBe("日本…");
    expect(cellWidth(fit("日本語", 5))).toBe(5);
  });
  it("alignRight pads on the left", () => {
    expect(alignRight("3×", 5)).toBe("   3×");
  });
  it("rowsOf counts rows in cells", () => {
    expect(rowsOf("日本語", 3)).toBe(2);
    expect(rowsOf("a\n\nb", 10)).toBe(3);
  });
  it("noteText puts │ on each line but the last, ╰▸ on it", () => {
    expect(noteText("one\ntwo\nthree", "  ")).toBe("  │  one\n  │  two\n  ╰▸ three");
    expect(noteText("one")).toBe("╰▸ one");
  });
});

describe("widthCap", () => {
  it("is a cap, never a target", () => {
    expect(widthCap("reading", 240)).toBe(96);
    expect(widthCap("reading", 48)).toBe(48);
    expect(widthCap("wide", 240)).toBe(238);
    expect(widthCap("auto", 240, 30)).toBe(30);
    expect(widthCap("auto", 240, 200)).toBe(72);
  });
});
