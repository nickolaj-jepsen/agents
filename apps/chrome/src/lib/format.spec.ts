import { describe, expect, it } from "vitest";
import {
  formatAge,
  formatCost,
  formatTokens,
  oneLine,
  sanitizeLabel,
  shortPath,
  splitPath,
} from "./format.ts";

const HOME = "/home/e2e";

describe("a path as the footer and the title show it", () => {
  it("splits the checkout from the road that leads to it", () => {
    expect(splitPath("/home/e2e/worktrees/orders", HOME)).toEqual({
      parent: "~/worktrees/",
      name: "orders",
    });
  });

  it("shows the home folder itself as ~", () => {
    expect(splitPath(HOME, HOME)).toEqual({ parent: "", name: "~" });
  });

  it("leaves a folder outside home whole", () => {
    expect(splitPath("/srv/orders", HOME)).toEqual({ parent: "/srv/", name: "orders" });
  });

  it("elides the middle of a deep path and keeps its last segment", () => {
    expect(shortPath("/home/e2e/worktrees/agents/pi-chrome-02/apps/chrome", HOME)).toBe(
      "~/…/chrome",
    );
    expect(shortPath("/srv/a/b/c/d", HOME)).toBe("/srv/…/d");
  });

  it("keeps a path under home that is two steps deep as it is", () => {
    expect(shortPath("/home/e2e/nixos", HOME)).toBe("~/nixos");
  });
});

describe("a coarse age", () => {
  it("says now under a minute", () => {
    expect(formatAge(0, "now")).toBe("now");
    expect(formatAge(59_999, "now")).toBe("now");
  });

  it("counts minutes, then hours up to two days, then days", () => {
    expect(formatAge(60_000, "now")).toBe("1m");
    expect(formatAge(59 * 60_000, "now")).toBe("59m");
    expect(formatAge(60 * 60_000, "now")).toBe("1h");
    expect(formatAge(47 * 3_600_000, "now")).toBe("47h");
    expect(formatAge(48 * 3_600_000, "now")).toBe("2d");
  });
});

describe("one line", () => {
  it("collapses an error message's whitespace", () => {
    expect(oneLine("  upstream\n  refused\t the request ")).toBe("upstream refused the request");
  });
});

describe("a token count", () => {
  it("reads in the units the row has room for", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(840)).toBe("840");
    expect(formatTokens(9_500)).toBe("9.5k");
    expect(formatTokens(12_500)).toBe("13k");
    expect(formatTokens(200_000)).toBe("200k");
    expect(formatTokens(1_500_000)).toBe("1.5M");
  });
});

describe("what a session cost", () => {
  it("keeps a figure below a tenth of a cent from rounding to nothing", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.0004)).toBe("<$0.001");
    expect(formatCost(0.0042)).toBe("$0.004");
    expect(formatCost(0.42)).toBe("$0.42");
  });
});

describe("a label the frame did not write", () => {
  it("drops terminal sequences and keeps the words", () => {
    expect(sanitizeLabel("\x1b[31mbuild\x1b[0m ok")).toBe("build ok");
    expect(sanitizeLabel("\x1b]0;title\x07done")).toBe("done");
  });

  it("folds a label onto one line", () => {
    expect(sanitizeLabel("  two\nlines\tand   spaces ")).toBe("two lines and spaces");
  });

  it("leaves wide characters alone", () => {
    expect(sanitizeLabel("ビルド 完了")).toBe("ビルド 完了");
  });

  it("removes every C0 control, DEL and C1 control, not only the ones a terminal prints", () => {
    // NULL, bell, backspace, vertical tab, form feed, ESC's working range, DEL, and C1 (0x80-0x9F).
    for (const char of ["\u0000", "\u0007", "\u0008", "\u000b", "\u000c", "\u001b", "\u007f"])
      expect(sanitizeLabel(`a${char}b`)).toBe("a b");
    for (let code = 0x80; code <= 0x9f; code++)
      expect(sanitizeLabel(`a${String.fromCharCode(code)}b`)).toBe("a b");
  });

  it("keeps a row from being cleared or retitled by what it carries", () => {
    // A bare C1 CSI, and an OSC title, reach a terminal without an ESC in front of them.
    expect(sanitizeLabel("a\u009b2Jb")).toBe("a 2Jb");
    expect(sanitizeLabel("a\u009d0;title\u0007b")).toBe("a 0;title b");
  });

  it("keeps printable non-ASCII text, marks and emoji", () => {
    expect(sanitizeLabel("café · naïve — 日本語 🎉")).toBe("café · naïve — 日本語 🎉");
  });
});
