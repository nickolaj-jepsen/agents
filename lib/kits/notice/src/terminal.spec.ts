import { describe, expect, test } from "vitest";
import { span, textOf, widthOf } from "@agents/kit-core/lines.ts";
import { notice } from "./terminal.ts";

describe("a notice of spans", () => {
  const spans = [
    span("a dim lead ", { role: "dim" }),
    span("word", { bold: true }),
    span(" and the rest"),
  ];

  test("keeps each span's style and gives the others the status's role", () => {
    const [row] = notice({ text: spans, width: 80, status: "warning" });
    expect(row?.spans.map((s) => [s.text, s.role, s.bold])).toEqual([
      ["a dim lead ", "dim", undefined],
      ["word", "warning", true],
      [" and the rest", "warning", undefined],
    ]);
  });

  test("is cut to one row with an ellipsis, or wraps whole", () => {
    expect(notice({ text: spans, width: 12, status: "dim" })).toHaveLength(1);
    expect(textOf(notice({ text: spans, width: 12, status: "dim" })[0]!).endsWith("…")).toBe(true);
    const wrapped = notice({ text: spans, width: 12, status: "dim", isWrapped: true });
    expect(wrapped.length).toBeGreaterThan(1);
    for (const l of wrapped) expect(widthOf(l)).toBeLessThanOrEqual(12);
  });
});
