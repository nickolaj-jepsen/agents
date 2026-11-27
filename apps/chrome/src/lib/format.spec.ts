import { describe, expect, it } from "vitest";
import { formatAge, oneLine, shortPath, splitPath } from "./format.ts";

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
