import { describe, expect, it } from "vitest";
import { liveFrame } from "./frame.ts";

describe("where the frame is drawn", () => {
  it("draws in an interactive terminal", () => {
    expect(liveFrame("tui", true)).toBe(true);
  });

  it("draws nothing headless or over a protocol", () => {
    expect(liveFrame("print", false)).toBe(false);
    expect(liveFrame("json", false)).toBe(false);
    expect(liveFrame("rpc", true)).toBe(false);
  });

  it("draws nothing when the session reports no UI", () => {
    expect(liveFrame("tui", false)).toBe(false);
  });
});
