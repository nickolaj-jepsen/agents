import { describe, expect, it } from "vitest";
import { bump, compareSemver, isPlain, isPrerelease, isSemver, tierOf } from "./version.ts";

describe("version", () => {
  it("reads how finished a unit is from the version", () => {
    expect(tierOf("0.0.1")).toBe("unfinished");
    expect(tierOf("0.0.12")).toBe("unfinished");
    expect(tierOf("0.1.0")).toBe("pre-release");
    expect(tierOf("0.9.3")).toBe("pre-release");
    expect(tierOf("1.0.0")).toBe("release");
    expect(tierOf("12.4.0")).toBe("release");
    expect(tierOf("1.3.0-rc.1")).toBe("pre-release");
  });

  it("flags everything below 1.0.0 as a pre-release", () => {
    expect(isPrerelease("0.0.1")).toBe(true);
    expect(isPrerelease("0.2.0")).toBe(true);
    expect(isPrerelease("1.0.0")).toBe(false);
  });

  it("tells a plain version from a suffixed one and from no version", () => {
    expect(isSemver("1.3.0-rc.1")).toBe(true);
    expect(isPlain("1.3.0-rc.1")).toBe(false);
    expect(isPlain("1.3.0+build.4")).toBe(false);
    expect(isPlain("1.3.0")).toBe(true);
    expect(isSemver("1.3")).toBe(false);
    expect(isSemver(undefined)).toBe(false);
  });

  it("orders versions by number, not by text", () => {
    expect(compareSemver("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
    expect(compareSemver("0.0.1", "0.1.0")).toBeLessThan(0);
  });

  it("bumps a level and resets what is below it", () => {
    expect(bump("0.2.3", "patch")).toBe("0.2.4");
    expect(bump("0.2.3", "minor")).toBe("0.3.0");
    expect(bump("0.2.3", "major")).toBe("1.0.0");
    expect(bump("1.3.0-rc.1", "patch")).toBe("1.3.1");
  });
});
