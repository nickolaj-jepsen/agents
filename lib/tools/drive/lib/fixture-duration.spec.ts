import { expect, it, vi } from "vitest";
import type { ExtensionAPI, ToolRendererResolver } from "@earendil-works/pi-coding-agent";
import { fixedToolDuration } from "../assets/fixed-tool-duration.ts";

function fixture(duration: number) {
  let resolver: ToolRendererResolver | undefined;
  const pi = {
    registerToolRenderer: (value: ToolRendererResolver) => {
      resolver = value;
    },
  } as ExtensionAPI;
  fixedToolDuration(pi, duration);
  return resolver!;
}

it("fixes duration before the plugin renders, preserving the other arguments and context", () => {
  const resolver = fixture(12);
  const renderResult = vi.fn(() => ({ render: () => [], invalidate() {} }));
  const base = { renderResult };
  const wrapped = resolver("bash", () => base)!;
  for (const durationMs of [9, 99, 100, 999, 1000, 12_000]) {
    const args = [
      { content: [] },
      { expanded: false },
      {},
      { durationMs, isError: false },
    ] as unknown as Parameters<NonNullable<typeof wrapped.renderResult>>;
    wrapped.renderResult!(...args);
    expect(renderResult.mock.calls.at(-1)).toEqual([
      args[0],
      args[1],
      args[2],
      { durationMs: 12, isError: false },
    ]);
    expect(args[3].durationMs).toBe(durationMs);
  }
});

it("leaves absent renderers alone", () => {
  const resolver = fixture(12);
  expect(resolver("bash", () => undefined)).toBeUndefined();
  const base = {};
  expect(resolver("bash", () => base)).toBe(base);
});

it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects invalid fixture duration %s",
  (duration) => {
    expect(() => fixture(duration)).toThrow("FIXTURE_TOOL_DURATION_MS");
  },
);
