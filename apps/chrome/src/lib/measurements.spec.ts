import { describe, expect, it } from "vitest";
import { cellWidth } from "@agents/kit-core/lines.ts";
import type { Part } from "./line.ts";
import {
  contextPart,
  contextRole,
  ERROR_PCT,
  measurementLevels,
  WARN_PCT,
} from "./measurements.ts";

const CHIPS: Part[] = [
  { id: "tools", text: "\uf489", role: "dim", action: "tools", hitPad: 2 },
  { id: "thinking", text: "\uf0eb", role: "accent", action: "thinking", hitPad: 2 },
];

const METERS = [
  { id: "cost", text: "$0.42" },
  { id: "speed", text: "48 t/s" },
];

const levels = (over: Partial<Parameters<typeof measurementLevels>[0]> = {}) =>
  measurementLevels({ chips: CHIPS, percent: 12, window: 200_000, meters: METERS, ...over });

const text = (parts: readonly Part[]) => parts.map((p) => p.text).join(" | ");

describe("the context reading", () => {
  it("says the share used and the window it is a share of", () => {
    const part = contextPart(12.7, 200_000);
    expect(part?.id).toBe("context");
    expect(part?.action).toBe("tree");
    expect(part?.text).toBe("12% / 200k");
    // The percentage is the measurement, in the context's own colour; the window stands quieter.
    expect(part?.spans?.map((s) => s.role)).toEqual(["dim", "dim"]);
    expect(contextPart(90, 200_000)?.spans?.map((s) => s.role)).toEqual(["error", "dim"]);
  });

  it("leaves the window out when the model declares none", () => {
    expect(contextPart(12, 0)?.text).toBe("12%");
  });

  it("is absent, not zero, when pi has measured nothing", () => {
    expect(contextPart(undefined)).toBeUndefined();
    expect(contextPart(Number.NaN)).toBeUndefined();
  });

  it("leaves the neutral colour until the fill is worth acting on", () => {
    expect(contextRole(0)).toBe("dim");
    expect(contextRole(WARN_PCT - 1)).toBe("dim");
    expect(contextRole(WARN_PCT)).toBe("warning");
    expect(contextRole(ERROR_PCT)).toBe("error");
    expect(contextRole(100)).toBe("error");
  });
});

describe("the border's readings", () => {
  it("leads with the two chips, then the context, then the meters", () => {
    expect(text(levels()[0] ?? [])).toBe("\uf489 | \uf0eb | 12% / 200k | $0.42 | 48 t/s");
  });

  it("gives up the furthest meter first, so a narrow border keeps the cost", () => {
    const steps = levels().map(text);
    expect(steps[1]).toBe("\uf489 | \uf0eb | 12% / 200k | $0.42");
    expect(steps[2]).toBe("\uf489 | \uf0eb | 12% / 200k");
  });

  it("drops the window before the share, and keeps the chips to the end", () => {
    const steps = levels().map(text);
    expect(steps[3]).toBe("\uf489 | \uf0eb | 12%");
    expect(steps[3]).toContain("\uf489");
  });

  it("has nothing but the chips when the context cannot be measured", () => {
    expect(levels({ percent: undefined }).map(text)).toEqual([
      "\uf489 | \uf0eb | $0.42 | 48 t/s",
      "\uf489 | \uf0eb | $0.42",
      "\uf489 | \uf0eb",
    ]);
  });

  it("measures a wide reading in cells, not characters", () => {
    const level = levels({ meters: [{ id: "cost", text: "費用 42" }] })[0] ?? [];
    const meter = level[level.length - 1];
    expect(meter?.text).toBe("費用 42");
    expect(cellWidth(meter?.text ?? "")).toBe(7);
  });
});
