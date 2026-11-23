/**
 * What a folded result says: the facts it keeps, the quote only a command earns, and the calls
 * that must stay pi's own. The row is one line whatever the result held, so a missing fact or an
 * extra one is visible in the transcript rather than merely wrong.
 */
import { describe, expect, test } from "vitest";
import { meaningOf } from "@agents/kit-core/icons.ts";
import { textOf } from "@agents/kit-core/lines.ts";
import { folds, keepsBody, quotedLine, seconds, summarySpans } from "./summary.ts";

// The meaning's own glyph: the kit draws the success state with it elsewhere.
const CHECK = meaningOf("state:success").glyph;

describe("seconds", () => {
  test("milliseconds under a second, rounded", () => {
    expect(seconds(0)).toBe("0ms");
    expect(seconds(999)).toBe("999ms");
  });

  test("one decimal from a second, losing a trailing zero", () => {
    expect(seconds(1000)).toBe("1s");
    expect(seconds(1250)).toBe("1.3s");
    expect(seconds(1999)).toBe("2s");
    expect(seconds(60_000)).toBe("60s");
  });
});

describe("summarySpans", () => {
  test("the check takes the first fact without a separator", () => {
    expect(summarySpans({ toolName: "read", body: "one\ntwo", durationMs: 1250 })).toEqual([
      { text: CHECK, role: "success" },
      { text: " ", role: "dim" },
      { text: "1.3s", role: "dim" },
      { text: " · ", role: "dim" },
      { text: "2 lines", role: "dim" },
    ]);
  });

  test("one line is singular", () => {
    const spans = summarySpans({ toolName: "read", body: "one" });
    expect(textOf({ spans })).toBe(`${CHECK} 1 line`);
  });

  test("a shell command adds its last line, trimmed, in the text role", () => {
    expect(summarySpans({ toolName: "bash", body: "one\ntwo\n  last  ", durationMs: 5 })).toEqual([
      { text: CHECK, role: "success" },
      { text: " ", role: "dim" },
      { text: "5ms", role: "dim" },
      { text: " · ", role: "dim" },
      { text: "3 lines", role: "dim" },
      { text: " · ", role: "dim" },
      { text: "last", role: "text" },
    ]);
  });

  test("only a command quotes its last line", () => {
    const spans = summarySpans({ toolName: "read", body: "one\ntwo" });
    expect(textOf({ spans })).toBe(`${CHECK} 2 lines`);
  });

  test("a command with one line quotes it beside its size", () => {
    const spans = summarySpans({ toolName: "bash", body: "ok" });
    expect(textOf({ spans })).toBe(`${CHECK} 1 line · ok`);
  });

  test("an empty result is just the check", () => {
    expect(summarySpans({ toolName: "read", body: "" })).toEqual([
      { text: CHECK, role: "success" },
    ]);
  });

  test("trailing whitespace does not count as a line", () => {
    const spans = summarySpans({ toolName: "read", body: "one\n" });
    expect(textOf({ spans })).toBe(`${CHECK} 1 line`);
  });
});

describe("quotedLine", () => {
  test("a command's last line is trimmed, and nothing else has one", () => {
    expect(quotedLine("bash", "a\nb  ")).toBe("b  ".trim());
    expect(quotedLine("read", "a\nb")).toBeUndefined();
  });

  test("an empty command output has no line to quote", () => {
    expect(quotedLine("bash", "")).toBeUndefined();
  });
});

describe("folds", () => {
  const plain = { expanded: false, isPartial: false, isError: false, hasImage: false };

  test("a finished result folds", () => {
    expect(folds("read", plain)).toBe(true);
  });

  test("a tool whose body is the payload never folds", () => {
    for (const toolName of ["edit", "write", "ask_user_question", "docfix"]) {
      expect(keepsBody(toolName)).toBe(true);
      expect(folds(toolName, plain)).toBe(false);
    }
  });

  test("an unknown tool folds like any other", () => {
    expect(keepsBody("grep")).toBe(false);
    expect(folds("grep", plain)).toBe(true);
  });

  test("expansion, streaming, failure and pictures keep pi's rendering", () => {
    expect(folds("read", { ...plain, expanded: true })).toBe(false);
    expect(folds("read", { ...plain, isPartial: true })).toBe(false);
    expect(folds("read", { ...plain, isError: true })).toBe(false);
    expect(folds("read", { ...plain, hasImage: true })).toBe(false);
  });
});
