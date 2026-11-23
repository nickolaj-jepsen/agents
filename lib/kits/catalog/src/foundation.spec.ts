/** The design foundation's terminal forms (`core`): a role keeps today's look, a panel is a rail, an icon a glyph. */
import { describe, expect, test } from "vitest";
import { meanings } from "@agents/kit-core/icons.ts";
import {
  blank,
  inline,
  markdownOfSpans,
  line,
  meaningSpan,
  panelLines,
  span,
  terminalStyle,
  textOf,
  typed,
} from "@agents/kit-core/lines.ts";
import { tokens } from "@agents/kit-core/tokens.ts";

describe("type roles on a terminal", () => {
  test("one size: a semibold or bold weight is bold, a dim role is dim, body is plain", () => {
    expect(terminalStyle("title")).toEqual({ bold: true });
    expect(terminalStyle("heading")).toEqual({ bold: true });
    expect(terminalStyle("section")).toEqual({ bold: true });
    expect(terminalStyle("body")).toEqual({});
    expect(terminalStyle("caption")).toEqual({ role: "dim" });
  });

  test("a role's span adds the caller's style to its own", () => {
    expect(typed("caption", "3 open", { hit: "x" })).toEqual({
      text: "3 open",
      role: "dim",
      hit: "x",
    });
  });

  test("every role names a size and a weight the host's scale has", () => {
    for (const r of Object.values(tokens.type)) {
      expect(["caption", "footnote", "body", "heading", "title"]).toContain(r.size);
      expect(["regular", "medium", "semibold", "bold"]).toContain(r.weight);
    }
  });
});

describe("a panel on a terminal", () => {
  test("is a rail down every row, a blank one too", () => {
    const rows = panelLines([line([span("one")]), blank(), line([span("two")])]);
    expect(rows.map(textOf)).toEqual([
      `${tokens.glyph.rail}  one`,
      tokens.glyph.rail,
      `${tokens.glyph.rail}  two`,
    ]);
  });
});

describe("icons that carry a meaning", () => {
  test("every meaning has a glyph and a role on a terminal, and says what it is", () => {
    for (const [name, m] of Object.entries(meanings)) {
      expect(m.glyph, name).not.toBe("");
      expect(m.alt, name).not.toBe("");
      expect(meaningSpan(name as keyof typeof meanings)).toMatchObject({
        text: m.glyph,
        role: m.role,
      });
    }
  });

  test("the legacy designs' meanings are all there", () => {
    const names = Object.keys(meanings);
    for (const want of [
      "priority:none",
      "priority:urgent",
      "kind:wrong",
      "kind:stale",
      "kind:missing",
      "decision:apply",
      "decision:dismiss",
      "state:error",
      "state:warning",
      "state:success",
    ])
      expect(names).toContain(want);
  });

  test("a colour mark is for an actual state: a priority or a field is grey, but urgent", () => {
    for (const [name, m] of Object.entries(meanings))
      if (name.startsWith("priority:") && name !== "priority:urgent")
        expect(m.tone, name).toBe("neutral");
  });
});

describe("a title of spans as the host's Markdown heading", () => {
  test("escapes plain words, writes code as inline code, drops bold and links", () => {
    const md = markdownOfSpans(inline("Honor `Retry-After` when *it* backs off"));
    expect(md).toBe("Honor `Retry-After` when it backs off");
  });

  test("a title with every Markdown character stays words", () => {
    const md = markdownOfSpans([{ text: "a*b_c #1 [x](y) `z` <i> ~ | + !" }]);
    expect(md).toBe("a\\*b\\_c \\#1 \\[x\\]\\(y\\) \\`z\\` \\<i\\> \\~ \\| \\+ \\!");
  });

  test("a code span that holds a backtick is fenced by a longer one", () => {
    expect(markdownOfSpans([{ text: "a`b", role: "code" }])).toBe("`` a`b ``");
  });
});
