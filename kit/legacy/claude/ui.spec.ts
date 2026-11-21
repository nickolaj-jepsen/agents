import { describe, expect, it } from "vitest";
import {
  alignRight,
  cellWidth,
  clamp,
  fileUrl,
  fit,
  fitImage,
  inlineLines,
  noteText,
  rowsOf,
  widthCap,
} from "./ui.tsx";

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

describe("inlineLines", () => {
  const said = (lines: ReturnType<typeof inlineLines>) =>
    lines.map((line) => line.map((run) => run.text).join(""));
  it("sets code, bold, italics and a link's words; a marker inside a word is a letter", () => {
    expect(
      inlineLines("Call `redirect()`, **now**, *maybe* or _later_; see [the RFC](https://x.y)"),
    ).toEqual([
      [
        { text: "Call " },
        { text: "redirect()", isCode: true },
        { text: ", " },
        { text: "now", isBold: true },
        { text: ", " },
        { text: "maybe", isItalic: true },
        { text: " or " },
        { text: "later", isItalic: true },
        { text: "; see the RFC" },
      ],
    ]);
    expect(said(inlineLines("snake_case_name and a*b*c"))).toEqual(["snake_case_name and a*b*c"]);
  });
  it("wraps in cells, drops the space at a break and breaks a word too long", () => {
    const lines = inlineLines("A 200 response like `{kind: redirect}` is cached per URL", {
      width: 20,
    });
    expect(said(lines)).toEqual(["A 200 response like", "{kind: redirect} is", "cached per URL"]);
    expect(lines[1]?.[0]).toEqual({ text: "{kind: redirect}", isCode: true });
    expect(said(inlineLines("abcdefghij", { width: 4 }))).toEqual(["abcd", "efgh", "ij"]);
    const wide = said(inlineLines("日本語のテキスト", { width: 5 }));
    expect(wide.every((line) => cellWidth(line) <= 5)).toBe(true);
  });
  it("keeps the aside's own spacing mid-line and dims it", () => {
    expect(inlineLines("Drop it.", { aside: "  Recommended" })).toEqual([
      [{ text: "Drop it." }, { text: "  Recommended", isDim: true }],
    ]);
    expect(said(inlineLines("Drop it.", { width: 12, aside: "  Recommended" }))).toEqual([
      "Drop it.",
      "Recommended",
    ]);
  });
});

describe("fitImage", () => {
  it("fills the available width while preserving the image's aspect ratio", () => {
    expect(fitImage({ width: 1600, height: 800 }, { columns: 80, rows: 30 })).toEqual({
      columns: 80,
      rows: 20,
    });
  });

  it("fits portrait images to the row limit and narrows their columns", () => {
    expect(fitImage({ width: 600, height: 1200 }, { columns: 80, rows: 15 })).toEqual({
      columns: 15,
      rows: 15,
    });
  });

  it("clamps both axes, handles unknown dimensions and never returns zero", () => {
    expect(fitImage(null, { columns: 400, rows: 400 })).toEqual({ columns: 255, rows: 80 });
    expect(fitImage({ width: 0, height: -1 }, { columns: 0, rows: 0 })).toEqual({
      columns: 1,
      rows: 1,
    });
    expect(fitImage({ width: 100, height: 50 }, { columns: NaN, rows: NaN })).toEqual({
      columns: 1,
      rows: 1,
    });
  });

  it("escapes file URL path segments but keeps their slashes", () => {
    expect(fileUrl("/tmp/a picture#1.png")).toBe("file:///tmp/a%20picture%231.png");
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
