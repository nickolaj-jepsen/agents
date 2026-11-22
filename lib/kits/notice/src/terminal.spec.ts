import { describe, expect, test } from "vitest";
import { span, textOf, widthOf } from "@agents/kit-core/lines.ts";
import { noticeLineStories } from "./stories.ts";
import { notice } from "./terminal.ts";

describe("every notice story", () => {
  test.each(noticeLineStories.map((s) => ({ id: `${s.component}/${s.state}`, story: s })))(
    "$id fits every width",
    ({ story }) => {
      for (let width = 24; width <= 130; width++)
        for (const l of story.lines(width))
          expect(widthOf(l), `${width}: ${textOf(l)}`).toBeLessThanOrEqual(width);
    },
  );
});

describe("a notice of spans", () => {
  const spans = [
    span("a dim lead ", { role: "dim" }),
    span("word", { bold: true }),
    span(" and the rest"),
  ];

  test("keeps each span's style and gives the others the status's role", () => {
    const [row] = notice(spans, 80, "warning");
    expect(row?.spans.map((s) => [s.text, s.role, s.bold])).toEqual([
      ["a dim lead ", "dim", undefined],
      ["word", "warning", true],
      [" and the rest", "warning", undefined],
    ]);
  });

  test("is cut to one row with an ellipsis, or wraps whole", () => {
    expect(notice(spans, 12, "dim")).toHaveLength(1);
    expect(textOf(notice(spans, 12, "dim")[0]!).endsWith("…")).toBe(true);
    const wrapped = notice(spans, 12, "dim", { isWrapped: true });
    expect(wrapped.length).toBeGreaterThan(1);
    for (const l of wrapped) expect(widthOf(l)).toBeLessThanOrEqual(12);
  });
});
