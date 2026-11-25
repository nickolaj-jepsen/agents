import { describe, expect, test } from "vitest";

import { noticeLines, warningMessages } from "./notices.ts";

describe("noticeLines", () => {
  test("gives each notice its own Note line", () => {
    expect(
      noticeLines([
        { code: "RESTRICTIONS_RELAXED", message: "No pages matched includeDomains; searched all." },
        { code: "OTHER", message: "  Second.  " },
      ]),
    ).toEqual(["Note: No pages matched includeDomains; searched all.", "Note: Second."]);
  });

  test("falls back to the code when a notice has no message", () => {
    expect(noticeLines([{ code: "NEW_CODE" }])).toEqual(["Note: NEW_CODE"]);
  });

  test("is empty when the response has none", () => {
    expect(noticeLines(undefined)).toEqual([]);
    expect(noticeLines([{}])).toEqual([]);
  });
});

describe("warningMessages", () => {
  test("keeps the messages", () => {
    expect(warningMessages([{ code: "IGNORED_FIELD", path: "/x", message: "Remove x." }])).toEqual([
      "Remove x.",
    ]);
  });
});
