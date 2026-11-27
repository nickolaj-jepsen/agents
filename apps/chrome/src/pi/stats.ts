/**
 * The session's cost, cache health and speed, and pi's context usage. Both are recomputed only
 * when the session leaf or the model moves: pi rebuilds the session's projection on every usage
 * call, and the border and the footer both ask while the session runs.
 *
 * `getEntries()` copies the session, so the key leaves the entry count out; only moving the leaf
 * back to an earlier entry escapes that, and a caller that does it (`session_tree`) resets.
 */
import type { ContextUsage, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { collectStats, type EntryLike, type Stats } from "../lib/stats.ts";

type ActiveModel = NonNullable<ExtensionContext["model"]>;

const modelKey = (model: ActiveModel | undefined) => (model ? `${model.provider}/${model.id}` : "");

const memoizeOnSession = <A extends [ActiveModel | undefined], T>(
  compute: (ctx: ExtensionContext, ...args: A) => T,
) => {
  let cache: { key: string; value: T } | undefined;
  const get = (ctx: ExtensionContext, ...args: A): T => {
    const session = ctx.sessionManager;
    const key = [session.getSessionId(), session.getLeafId(), modelKey(args[0])].join("\n");
    if (cache?.key === key) return cache.value;
    const value = compute(ctx, ...args);
    cache = { key, value };
    return value;
  };
  return { get, reset: () => (cache = undefined) };
};

export type StatsReader = ReturnType<typeof createStats>;

/** Cost, cache health, speed and context usage for the session, recomputed when either moves. */
export const createStats = () => {
  const stats = memoizeOnSession((ctx, model) =>
    collectStats(ctx.sessionManager.getEntries() as unknown as readonly EntryLike[], model),
  );
  const context = memoizeOnSession((ctx) => ctx.getContextUsage());

  return {
    statsFor: (ctx: ExtensionContext, model: ActiveModel | undefined): Stats =>
      stats.get(ctx, model),
    contextFor: (ctx: ExtensionContext, model: ActiveModel | undefined): ContextUsage | undefined =>
      context.get(ctx, model),
    /** After a compaction or a move through the session tree, which rewrite or rewind the leaf. */
    reset: () => {
      stats.reset();
      context.reset();
    },
  };
};
