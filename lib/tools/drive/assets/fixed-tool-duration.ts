import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Freeze a fixture's duration before layout: a text mask cannot undo wrapping or truncation. */
export function fixedToolDuration(pi: ExtensionAPI, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0)
    throw new Error("FIXTURE_TOOL_DURATION_MS must be a non-negative number");
  pi.registerToolRenderer((_name, next) => {
    const base = next();
    const render = base?.renderResult;
    if (!render) return base;
    return {
      ...base,
      renderResult: (result, options, theme, context) =>
        render(result, options, theme, { ...context, durationMs }),
    };
  });
}
