import { describe, expect, test } from "vitest";
import { textOf } from "@agents/kit-core/lines.ts";
import type { Detail } from "./contract.ts";
import { detail, detailRange } from "./terminal.ts";

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

  test("cut to a height, its edges count what is out of sight, as every kit window does", () => {
    const cut = detail({ ...ITEM, height: 4 }, 24).map(textOf);
    expect(cut).toEqual(["wrong · seen 3×", "A title that wraps onto", "a second row", "↓ 7 more"]);
    const max = detailRange({ ...ITEM, height: 4 }, 24);
    const end = detail({ ...ITEM, height: 4, offset: max }, 24).map(textOf);
    expect(end).toEqual(["↑ 7 more", "", "path   a/b.nix", "quote  “said so”"]);
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
    expect(textOf(rows[0]!)).toBe("─ Evidence 1 of 2 ───────────── Next [n]");
    expect(rows[0]!.hit).toBeUndefined();
    expect(
      rows[0]!.spans
        .filter((s) => s.hit === "next")
        .map((s) => s.text)
        .join(""),
    ).toBe("Next [n]");
    expect(detail({ meta: "m", hit: "open" }, 40)[0]!.hit).toBe("open");
  });

  test("a rule of several words has a short rule between them, as a frame's caption has", () => {
    const rule = (width: number) =>
      textOf(
        detail(
          {
            sections: [
              {
                rule: ["Evidence 1 of 2", "2 days ago"],
                action: { label: "Next", hotkey: "n", hit: "next" },
              },
            ],
          },
          width,
        )[0]!,
      );
    expect(rule(50)).toBe("─ Evidence 1 of 2 ── 2 days ago ───────── Next [n]");
    // Too narrow for its words: they are cut, and the control stays.
    expect(rule(36)).toBe("─ Evidence 1 of 2 ── 2 d… ─ Next [n]");
    expect(textOf(detail({ sections: [{ rule: "Evidence" }] }, 20)[0]!)).toBe(
      "─ Evidence ─────────",
    );
  });
});

describe("a framed detail", () => {
  test("its rules run the whole width and its text lines up with their words", () => {
    const rows = detail(
      {
        meta: "wrong",
        title: "A title",
        framed: true,
        sections: [
          {
            rule: ["Evidence", "today"],
            action: { label: "Read", hotkey: "e", hit: "read" },
            text: "Why it is wrong.",
          },
        ],
      },
      36,
    ).map(textOf);
    expect(rows).toEqual([
      "  wrong",
      "  A title",
      "",
      "─ Evidence ── today ───── Read [e] ─",
      "  Why it is wrong.",
    ]);
  });

  test("its text wraps within the frame's body, and a cut one says so in line with it", () => {
    const d = { ...ITEM, framed: true, height: 5 };
    const rows = detail(d, 28).map(textOf);
    for (const row of rows) expect(row === "" || row.startsWith("  ")).toBe(true);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(26);
    expect(rows.at(-1)).toBe("  ↓ 6 more");
    expect(detailRange(d, 28)).toBe(detailRange({ ...ITEM, height: 5 }, 24));
  });
});

describe("a detail with little room", () => {
  test("under three rows is all text, no marker", () => {
    expect(detail({ ...ITEM, height: 2 }, 24).map(textOf)).toEqual([
      "wrong · seen 3×",
      "A title that wraps onto",
    ]);
    const end = detail({ ...ITEM, height: 1, offset: 99 }, 24).map(textOf);
    expect(end).toEqual(["quote  “said so”"]);
  });

  test("a title can be held to a few rows, its last cut", () => {
    const rows = detail({ title: "one two three four five six", titleMax: 1 }, 12).map(textOf);
    expect(rows).toEqual(["one two…"]);
  });

  test("a control with nothing to do now is dim", () => {
    const [row] = detail(
      {
        sections: [{ rule: "E", action: { label: "Next", hotkey: "n", hit: "n", isQuiet: true } }],
      },
      30,
    );
    expect(row!.spans.find((s) => s.text === "Next")).toMatchObject({ role: "dim" });
  });
});
