import type { Theme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import {
  bandAct,
  bandRows,
  bandShell,
  chipRow,
  clamp,
  entries,
  List,
  hintAt,
  modalFrame,
  note,
  section,
  splitFrame,
  splitLayout,
  widthCap,
} from "./ui.ts";

/** Colour off: the pure layout. `tagged` keeps role names to assert on them. */
const plain = { fg: (_c: string, t: string) => t, bold: (t: string) => t } as unknown as Theme;
const tagged = {
  fg: (c: string, t: string) => `<${c}>${t}</>`,
  bold: (t: string) => t,
} as unknown as Theme;
const strip = (s: string) => stripTerminalSequences(s).replace(/<\/?\w+>/g, "");
const ends = (s: string, tail: string) => strip(s).trimEnd().endsWith(tail);
const widths = (lines: string[]) => lines.map(visibleWidth);

describe("clamp", () => {
  const text = "the quick brown fox jumps over the lazy dog";
  it("wraps without limit when given no options", () => {
    const lines = clamp(text, 10);
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.join(" ")).toBe(text);
  });
  it("one-line truncation fills the line before the ellipsis", () => {
    const [line, ...more] = clamp(text, 20, { min: 1, max: 1 });
    expect(more).toEqual([]);
    expect(strip(line!)).toBe("the quick brown fox…");
    expect(visibleWidth(line!)).toBe(20);
  });
  it("max cuts the last kept line full, not at the word break", () => {
    const lines = clamp(text, 12, { max: 2 });
    expect(lines).toHaveLength(2);
    expect(visibleWidth(lines[1]!)).toBe(12);
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
    expect(Math.max(...widths(lines))).toBeLessThanOrEqual(10);
    expect(ends(lines[1]!, "…")).toBe(true);
  });
  it("cuts a word longer than the width", () => {
    const [line] = clamp("x".repeat(50), 10, { min: 1, max: 1 });
    expect(visibleWidth(line!)).toBe(10);
    expect(ends(line!, "…")).toBe(true);
  });
  it("is empty at no width or no lines", () => {
    expect(clamp("text", 0)).toEqual([]);
    expect(clamp("text", 10, { max: 0 })).toEqual([]);
  });
});

describe("width classes", () => {
  it("are caps", () => {
    expect(widthCap("split", 240)).toBe(124);
    expect(widthCap("split", 80)).toBe(80);
    expect(widthCap("reading", 240)).toBe(96);
    expect(widthCap("dialog", 240)).toBe(72);
    expect(widthCap("wide", 240)).toBe(238);
    expect(widthCap("auto", 240, 30)).toBe(30);
    expect(widthCap("auto", 240, 200)).toBe(72);
  });
});

describe("blocks", () => {
  it("section is a bold title and a rule to the edge", () => {
    const line = section(plain, 20, "docs/a.md");
    expect(line).toBe("docs/a.md ──────────");
  });
  it("note guttes each line, ╰▸ on the last", () => {
    const lines = note(plain, 14, "one two three four five");
    expect(lines.at(-1)!.startsWith("╰▸ ")).toBe(true);
    expect(lines.slice(0, -1).every((l) => l.startsWith("│  "))).toBe(true);
    expect(note(plain, 30, "one")[0]).toBe("╰▸ one");
  });
});

const hints = [
  { key: "↑↓", label: "move" },
  { key: "space", label: "mark" },
  { key: "a", label: "apply" },
  { key: "d", label: "dismiss" },
  { key: "esc", label: "later", essential: true },
];

describe("modalFrame", () => {
  const frame = (width: number) =>
    modalFrame(plain, { width, title: "Doc suggestions", count: 3, body: ["body"], hints });
  it("is a rounded box exactly as wide as asked, at any width", () => {
    for (const w of [20, 30, 50, 72, 124]) {
      const lines = frame(w);
      expect(widths(lines).every((n) => n === w)).toBe(true);
      expect(lines[0]!.startsWith("╭─ ")).toBe(true);
      expect(lines.at(-1)!.endsWith("─╯")).toBe(true);
    }
  });
  it("sets the count in the title and the hints in the bottom border", () => {
    const lines = frame(72);
    expect(lines[0]).toContain("Doc suggestions  3 ");
    expect(lines.at(-1)).toMatch(
      /^╰─ ↑↓ move ── space mark ── a apply ── d dismiss ── esc later ─+╯$/,
    );
  });
  it("drops the lowest priority first, never the way out", () => {
    const at = (w: number) => frame(w).at(-1)!;
    expect(at(52)).toContain("a apply");
    expect(at(52)).not.toContain("dismiss");
    expect(at(30)).toContain("esc later");
    expect(at(30)).not.toContain("apply");
    expect(at(14)).toContain("esc");
  });
  it("has a blank row under the title and above the hints, and padding", () => {
    const lines = frame(30);
    expect(lines[1]).toBe("│" + " ".repeat(28) + "│");
    expect(lines[2]).toBe("│ body" + " ".repeat(22) + " │");
    expect(lines.at(-2)).toBe("│" + " ".repeat(28) + "│");
  });
  it("finds the hint under a column of the bottom border", () => {
    const border = frame(72).at(-1)!;
    const x = border.indexOf("esc later");
    expect(hintAt(72, hints, x)).toBe(hints[4]);
    expect(hintAt(72, hints, x - 2)).toBeUndefined();
    expect(hintAt(30, hints, frame(30).at(-1)!.indexOf("esc"))).toBe(hints[4]);
  });
  it("lets a notice take the blank row above the hints", () => {
    const lines = modalFrame(plain, {
      width: 30,
      title: "T",
      body: [],
      hints,
      notice: "Dismissed 1",
    });
    expect(lines.at(-2)).toContain("Dismissed 1");
  });
});

describe("splitFrame", () => {
  it("has ┬ over and ┴ under the divider, and stacks below 110 columns", () => {
    const layout = splitLayout(124, 130);
    expect(layout.stacked).toBe(false);
    const lines = splitFrame(plain, {
      layout,
      width: 124,
      title: "T",
      count: 2,
      left: ["a", "b", "c"],
      right: ["x"],
      hints,
    });
    expect(widths(lines).every((n) => n === 124)).toBe(true);
    const at = lines[0]!.indexOf("┬");
    expect(at).toBeGreaterThan(0);
    expect(lines.at(-1)!.indexOf("┴")).toBe(at);
    expect(lines.slice(1, -1).every((l) => l[at] === "│" || l[at] === " ")).toBe(true);
    expect(splitLayout(100, 109).stacked).toBe(true);
  });
});

type Row = { id: string; group: string; title: string; seen: number; age: string };
const rows: Row[] = [
  {
    id: "1",
    group: "AGENTS.md",
    title: "First claim that is rather long and has to wrap around somewhere",
    seen: 3,
    age: "2d",
  },
  { id: "2", group: "docs/a.md", title: "Second", seen: 1, age: "9d" },
  { id: "3", group: "docs/a.md", title: "Third", seen: 2, age: "1mo" },
];
const list = () => {
  const l = new List<Row>({
    id: (r) => r.id,
    group: (r) => r.group,
    title: (r) => r.title,
    titleLines: { min: 1, max: 2 },
    marks: "multi",
    columns: [
      {
        width: 3,
        priority: 2,
        text: (r) => `${r.seen}×`,
        role: (r) => (r.seen >= 3 ? "warning" : undefined),
      },
      { width: 4, priority: 1, text: (r) => r.age },
    ],
  });
  l.setItems(rows);
  return l;
};

describe("List", () => {
  it("renders groups with a rule, a pointer and marks, columns aligned", () => {
    const l = list();
    l.toggle(1);
    const out = l.render(plain, 60, 20);
    expect(out[0]).toMatch(/^AGENTS\.md ─+$/);
    expect(out[1]!.startsWith("❯ □ First claim")).toBe(true);
    expect(out.find((x) => x.includes("Second"))).toContain("■");
    const metaAt = out.filter((x) => /×/.test(x)).map((x) => x.indexOf("×"));
    expect(new Set(metaAt).size).toBe(1);
    expect(widths(out).every((n) => n <= 60)).toBe(true);
  });
  it("wraps a group name that is longer than the list instead of cutting it", () => {
    const name =
      "docs/a-very-long-directory-name/with/several/nested/levels/and-a-long-file-name.md";
    const l = list();
    l.setItems(rows.map((r) => ({ ...r, group: name })));
    const out = l.render(plain, 30, 20).map(strip);
    const header = out.slice(
      0,
      out.findIndex((x) => x.startsWith("❯")),
    );
    expect(header.length).toBeGreaterThan(1);
    expect(header.join("").replace(/[ ─]+$/, "")).toBe(name);
    expect(header.join("")).not.toContain("…");
    // The rule closes the last line of the name, as on a short one.
    expect(header.at(-1)).toMatch(/─$|[a-z.]$/);
    expect(widths(out).every((n) => n <= 30)).toBe(true);
  });
  it("gives every row the same height whatever the cursor", () => {
    const l = list();
    const a = l.render(plain, 60, 20).length;
    l.move(1);
    expect(l.render(plain, 60, 20).length).toBe(a);
  });
  it("keeps blank rows between groups only while it fits", () => {
    const l = list();
    expect(l.render(plain, 60, 20).filter((x) => x === "")).toHaveLength(1);
    expect(l.render(plain, 60, 5).filter((x) => x === "")).toHaveLength(0);
  });
  it("scrolls to keep the cursor in view, header included", () => {
    const l = list();
    l.move(2);
    const out = l.render(plain, 60, 4);
    expect(out).toHaveLength(4);
    expect(out.some((x) => x.includes("Third"))).toBe(true);
    expect(out.some((x) => x.startsWith("docs/a.md"))).toBe(true);
    l.move(-2);
    expect(l.render(plain, 60, 4)[0]).toMatch(/^AGENTS\.md/);
  });
  it("hides the lowest priority column before shortening the title", () => {
    const l = list();
    const narrow = l.render(plain, 30, 20).join("\n");
    expect(narrow).toContain("3×");
    expect(narrow).not.toContain("2d");
    expect(l.render(plain, 60, 20).join("\n")).toContain("2d");
    expect(l.render(plain, 20, 20).join("\n")).not.toContain("×");
  });
  it("colours a field by predicate, and only that field", () => {
    const out = list().render(tagged, 60, 20).join("\n");
    expect(out).toContain("<warning>");
    expect(out.match(/<warning>/g)).toHaveLength(1);
  });
  it("wraps a long title over two lines and cuts the third", () => {
    const l = list();
    l.setItems([{ ...rows[0]!, title: "word ".repeat(60) }]);
    const out = l.render(plain, 40, 20).map(strip);
    expect(out).toHaveLength(3);
    expect(ends(out[2]!, "…")).toBe(true);
  });
  it("maps clicks to rows, and the mark column to a toggle", () => {
    const l = list();
    const out = l.render(plain, 60, 20).map(strip);
    const at = (needle: string) => out.findIndex((x) => x.includes(needle));
    const ev = (x: number, y: number, type: "click" | "move") =>
      ({ type, button: "left", x, y }) as never;
    expect(l.hit(10, at("AGENTS.md"))).toBeUndefined();
    expect(l.hit(10, at("Second"))).toEqual({ index: 1, mark: false });
    expect(l.hit(10, at("First claim") + 1)).toEqual({ index: 0, mark: false });
    l.mouse(ev(10, at("Third"), "click"));
    expect(l.cursor).toBe(2);
    expect(l.marked.size).toBe(0);
    l.mouse(ev(2, at("Second"), "click"));
    expect(l.cursor).toBe(1);
    expect(l.marked.has("2")).toBe(true);
    expect(l.mouse(ev(10, at("Second"), "move"))?.render).toBe(true);
    expect(l.hover).toBe(1);
  });
  it("picks the marked, else the current, and drops marks of gone items", () => {
    const l = list();
    expect(l.picked().map((r) => r.id)).toEqual(["1"]);
    l.toggle(1);
    l.toggle(2);
    expect(l.picked().map((r) => r.id)).toEqual(["2", "3"]);
    l.setItems(rows.slice(0, 2));
    expect([...l.marked]).toEqual(["2"]);
  });
});

describe("junction", () => {
  it("draws ┴ at every width a split can have, hints staying left of the divider", () => {
    for (const w of [96, 100, 110, 124]) {
      const layout = splitLayout(w, 120);
      const lines = splitFrame(plain, {
        layout,
        width: w,
        title: "T",
        count: 1,
        left: ["a"],
        right: ["b"],
        hints,
      });
      const at = lines[0]!.indexOf("┬");
      const bottom = lines.at(-1)!;
      expect(bottom.indexOf("┴"), `width ${w}`).toBe(at);
      expect(bottom).toContain("esc later");
      expect(bottom, `width ${w}`).toContain("d dismiss");
      expect(bottom[at - 1]).toBe("─");
      expect(bottom[at + 1]).toBe("─");
      expect(widths(lines).every((n) => n === w)).toBe(true);
    }
  });
});

describe("junction with many hints", () => {
  it("starts a hint after the junction and drops lowest priority only when the border is full", () => {
    const many = [
      { key: "↑↓", label: "move" },
      { key: "space", label: "mark" },
      { key: "a", label: "apply" },
      { key: "d", label: "dismiss" },
      { key: "x", label: "extra hint" },
      { key: "y", label: "another one" },
      { key: "esc", label: "later", essential: true },
    ];
    const at = (w: number) => {
      const layout = splitLayout(w, 130);
      const lines = splitFrame(plain, {
        layout,
        width: w,
        title: "T",
        left: ["a"],
        right: ["b"],
        hints: many,
      });
      return { tee: lines[0]!.indexOf("┬"), bottom: lines.at(-1)! };
    };
    const wide = at(124);
    expect(wide.bottom.indexOf("┴")).toBe(wide.tee);
    expect(wide.bottom).toContain("another one");
    const tight = at(60);
    expect(tight.bottom).toContain("esc later");
    expect(tight.bottom).not.toContain("another one");
    expect(widths([tight.bottom, wide.bottom])).toEqual([60, 124]);
  });
});

describe("List windows", () => {
  const many: Row[] = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    group: "g" + Math.floor(i / 4),
    title: "Title " + i + " " + "x".repeat(70),
    seen: 1,
    age: "1d",
  }));
  const wlist = () => {
    const l = list();
    l.setItems(many);
    return l;
  };
  it("shows a row whole or not at all, and says how many are hidden", () => {
    const l = wlist();
    l.move(5);
    for (const rows of [5, 7, 9]) {
      const out = l.render(plain, 40, rows).map(strip);
      expect(out.length).toBeLessThanOrEqual(rows);
      const titles = out.filter((x) => /Title \d/.test(x));
      const conts = out.filter((x) => /^ {4}x+…?$/.test(x));
      expect(conts.length).toBe(titles.length);
      expect(out.some((x) => x.includes("↑")) && out.some((x) => x.includes("↓"))).toBe(true);
    }
  });
  it("counts the rows hidden below at the top and above at the bottom", () => {
    const l = wlist();
    const top = l.render(plain, 40, 8).map(strip);
    expect(top.at(-1)).toMatch(/↓ \d+ more$/);
    expect(top.join("\n")).not.toContain("↑");
    l.move(11);
    const bottom = l.render(plain, 40, 8).map(strip);
    expect(bottom[0]).toMatch(/↑ \d+ more$/);
    expect(bottom.join("\n")).not.toContain("↓");
    expect(bottom.join("\n")).toContain("Title 11");
  });
  it("fills a window that grew, whatever size it had before", () => {
    const shrunk = wlist();
    shrunk.move(11);
    shrunk.render(plain, 40, 5);
    const fresh = wlist();
    fresh.move(11);
    expect(shrunk.render(plain, 40, 20).map(strip)).toEqual(fresh.render(plain, 40, 20).map(strip));
  });
});

describe("entries", () => {
  const items = [
    { date: "2026-11-13", text: "one two three four five six seven eight nine ten eleven twelve" },
    { date: "2026-10-16", text: "short" },
  ];
  it("is a date column and a hanging text column from 50 columns", () => {
    const out = entries(plain, 50, items);
    expect(out[0]!.startsWith("2026-11-13  one two")).toBe(true);
    expect(out[1]!.startsWith(" ".repeat(12))).toBe(true);
    expect(out.indexOf("")).toBeGreaterThan(0);
    expect(out.at(-1)).toBe("2026-10-16  short");
    expect(widths(out).every((n) => n <= 50)).toBe(true);
    expect(out.join("").includes("│")).toBe(false);
  });
  it("is a date line over the text below 50 columns", () => {
    const out = entries(plain, 30, items);
    expect(out[0]).toBe("2026-11-13");
    expect(out[1]!.startsWith("one two")).toBe(true);
    expect(out).toContain("2026-10-16");
    expect(out.at(-1)).toBe("short");
  });
  it("passes clamp options through and keeps a blank row between entries", () => {
    const out = entries(plain, 30, [items[0]!, items[1]!], { lines: { max: 1 } });
    expect(out).toHaveLength(2 + 1 + 2);
    expect(ends(out[1]!, "…")).toBe(true);
  });
  it("cuts the last visible text line with an ellipsis when its own text is hidden", () => {
    const long = [{ date: "2026-11-13", text: "word ".repeat(40) }];
    for (const [w, rows] of [
      [60, 2],
      [30, 3],
    ] as const) {
      const out = entries(plain, w, long, { rows });
      expect(out).toHaveLength(rows);
      expect(ends(out.at(-1)!, "…")).toBe(true);
      expect(strip(out.at(-1)!).trim()).not.toBe("…");
    }
  });
  it("counts whole entries left out on a ↓ n more line, never a bare ellipsis", () => {
    const three = [items[0]!, items[1]!, { date: "2026-09-02", text: "last" }];
    for (const w of [60, 30])
      for (let rows = 1; rows <= 12; rows++) {
        const out = entries(plain, w, three, { rows }).map(strip);
        expect(out.length, `w${w} rows${rows}`).toBeLessThanOrEqual(rows);
        expect(out.every((l) => l.trim() !== "…")).toBe(true);
        const hidden = out.find((l) => /↓ \d+ more/.test(l));
        if (hidden) {
          const n = Number(/↓ (\d+) more/.exec(hidden)![1]);
          expect(n).toBeGreaterThan(0);
          expect(out.filter((l) => /^\d{4}-/.test(l.trim())).length + n).toBeGreaterThanOrEqual(3);
        }
      }
    expect(entries(plain, 60, three, { rows: 1 }).map(strip)).toEqual(["↓ 3 more"]);
  });
  it("measures cells", () => {
    const out = entries(plain, 50, [{ date: "2026-11-13", text: "日本語".repeat(20) }], {
      lines: { max: 2 },
    });
    expect(out).toHaveLength(2);
    expect(widths(out).every((n) => n <= 50)).toBe(true);
  });
});

describe("bandShell", () => {
  const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `row ${i}` }));
  const base = { width: 60, title: "2 of 3", maxRows: 40, keys: "esc closes" };

  it("is `width` cells wide on every line, title in the top and keys in the bottom", () => {
    const { lines } = bandShell(plain, { ...base, body: rowsOf(2) });
    expect(widths(lines).every((n) => n === 60)).toBe(true);
    expect(strip(lines[0]!)).toMatch(/^╭─ 2 of 3 ─+╮$/);
    expect(strip(lines.at(-1)!)).toMatch(/^╰─+ esc closes ─╯$/);
  });
  it("pads a short body to the height of the tallest state, with the footer last", () => {
    const short = bandShell(plain, {
      ...base,
      height: 9,
      body: rowsOf(2),
      footer: { text: "b back" },
    });
    const tall = bandShell(plain, {
      ...base,
      height: 9,
      body: rowsOf(9),
      footer: { text: "b back" },
    });
    expect(short.lines).toHaveLength(tall.lines.length);
    expect(strip(short.lines.at(-2)!)).toContain("b back");
  });
  it("stands within the terminal, never below four body rows", () => {
    expect(bandRows(30, 40)).toBe(28);
    expect(bandRows(2, 40)).toBe(4);
    expect(bandRows(undefined, 40)).toBe(28);
    expect(bandRows(30, 10)).toBe(4);
  });
  it("scrolls a body taller than its room above the footer, and says so", () => {
    const o = { ...base, maxRows: 20, body: rowsOf(30), footer: { text: "b back" } };
    const top = bandShell(plain, o);
    expect(top.offset).toBe(0);
    expect(strip(top.lines[1]!)).toContain("row 0");
    expect(strip(top.lines.at(-1)!)).toContain("shift+↑↓ scrolls");
    const end = bandShell(plain, { ...o, offset: 99 });
    expect(end.offset).toBe(top.maxOffset);
    const reached = strip(end.lines.join("\n"));
    expect(reached).toContain("row 29");
    expect(reached).not.toContain("row 0");
    expect(strip(end.lines.at(-2)!)).toContain("b back");
  });
  it("draws the widest slot that fits, and none when none does", () => {
    const wide = { text: "✓ Q1  ○ Q2  ○ Q3" };
    const narrow = { text: "Q2" };
    const at = (width: number, right: { text: string }[]) =>
      strip(bandShell(plain, { ...base, width, right, body: [] }).lines[0]!);
    expect(at(60, [wide, narrow])).toContain("✓ Q1  ○ Q2  ○ Q3");
    expect(at(24, [wide, narrow])).toContain("  Q2 ");
    expect(at(12, [wide, narrow])).not.toContain("Q2");
    expect(widths([at(12, [wide])])[0]).toBe(12);
  });
  it("cuts keys that outrun the border, so the corner stays", () => {
    const { lines } = bandShell(plain, {
      ...base,
      width: 30,
      body: [],
      keys: "1-9 or enter answers · hjkl moves · esc closes",
    });
    expect(widths(lines).every((n) => n === 30)).toBe(true);
    expect(strip(lines.at(-1)!)).toMatch(/^╰.*… ─╯$/);
  });
  it("can stand on the line below it: no bottom border, the keys in a last row", () => {
    const closed = bandShell(plain, { ...base, body: rowsOf(1) }).lines;
    const joined = bandShell(plain, { ...base, isJoined: true, body: rowsOf(1) }).lines;
    expect(joined).toHaveLength(closed.length);
    expect(strip(joined.at(-1)!)).toMatch(/^│ esc closes +│$/);
    expect(widths([joined.at(-1)!])).toEqual([60]);
    expect(strip(joined.at(-1)!)).not.toMatch(/[╰╯]/);
  });
  it("can leave a blank row under the top border", () => {
    const plainBand = bandShell(plain, { ...base, body: rowsOf(1) }).lines;
    const roomy = bandShell(plain, { ...base, isRoomy: true, body: rowsOf(1) }).lines;
    expect(roomy).toHaveLength(plainBand.length + 1);
    expect(strip(roomy[1]!).replace(/[│ ]/g, "")).toBe("");
  });

  describe("bandAct", () => {
    const chips = chipRow(plain, [
      { key: "b", label: "back", act: "back" },
      { key: "f", label: "forward", act: "forward" },
    ]);
    const band = bandShell<string>(plain, {
      ...base,
      right: [
        {
          text: "Q1  Q2",
          cells: [
            { start: 0, end: 2, act: "q1" },
            { start: 4, end: 6, act: "q2" },
          ],
        },
      ],
      body: [{ text: "an answer", act: "pick" }, { text: "" }],
      footer: chips,
    });
    const at = (needle: string, line = band.lines) => {
      const y = line.findIndex((l) => strip(l).includes(needle));
      return { x: strip(line[y]!).indexOf(needle), y };
    };
    it("finds a chip by its columns, and a row where its text reaches", () => {
      const back = at("b back");
      expect(bandAct(band, back.x, back.y)).toBe("back");
      expect(bandAct(band, at("f forward").x + 2, back.y)).toBe("forward");
      const row = at("an answer");
      expect(bandAct(band, row.x, row.y)).toBe("pick");
      expect(bandAct(band, row.x + 30, row.y)).toBeUndefined();
    });
    it("finds the stops in the top border", () => {
      const q2 = at("Q2");
      expect(q2.y).toBe(0);
      expect(bandAct(band, q2.x, 0)).toBe("q2");
      expect(bandAct(band, at("Q1").x, 0)).toBe("q1");
      expect(bandAct(band, 1, 0)).toBeUndefined();
    });
    it("hits nothing on a border or a blank row", () => {
      expect(bandAct(band, 5, band.lines.length - 1)).toBeUndefined();
      expect(bandAct(band, 5, 2)).toBeUndefined();
    });
  });
});
