/**
 * The schema's checks must fire: each line below is an error, and `@ts-expect-error` makes
 * `check-types` fail the day it stops being one. `messages.check.ts` has the same cases without
 * the comments, for the spec that reads what tsc says.
 */
import { assertExports, type PartsOf } from "@agents/kit-core/manifest.ts";
import type { RowProps } from "./contract.ts";
import manifest from "./manifest.ts";

// @ts-expect-error a stray export
assertExports<typeof import("./bad/stray.ts"), PartsOf<typeof manifest, "terminal">>(true);
// @ts-expect-error a missing part
assertExports<typeof import("./bad/missing.ts"), PartsOf<typeof manifest, "terminal">>(true);

// @ts-expect-error `focused` on a surface where the host draws the focus
export const onVscode: RowProps<"vscode"> = { key: "a", text: "A", focused: true };
// @ts-expect-error `hovered` on a union: pi has it, vscode does not
export const onUnion: RowProps<"pi" | "vscode"> = { key: "a", text: "A", hovered: true };
// @ts-expect-error nobody has checked that desktop's host can do `window`
export const onDesktop: RowProps<"desktop"> = { key: "a", text: "A", detailLines: 2 };

// A capability guard narrows the union.
import { ctxOf, can, type Ctx } from "@agents/kit-core/surfaces.ts";
export function draw(ctx: Ctx<"pi" | "vscode">): RowProps<"pi" | "vscode"> {
  const row: RowProps<"pi" | "vscode"> = { key: "a", text: "A" };
  if (can(ctx, "keyFocus:kit")) {
    const narrowed: RowProps<typeof ctx.surface> = { ...row, focused: true };
    return narrowed;
  }
  return row;
}
export const pi = ctxOf("pi");
