/**
 * What the frame reads from the session's accounting: what it has cost, how well the provider's
 * cache is holding, and how fast the current model answered. Pure: it is given the session's
 * entries and says what they add up to, so a spec can hand in known usages instead of a provider.
 *
 * Every figure is pi's own estimate — `usage.cost` is computed from the model's prices, so it is
 * what the session would have been billed by that catalogue, not a statement about an account.
 * A figure that cannot be known is left undefined rather than zero, and the row draws nothing.
 */
export type UsageLike = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost?: { total?: number };
};

export type MessageLike = {
  role: string;
  usage?: UsageLike;
  provider?: string;
  model?: string;
  /** Milliseconds the reply took, measured by pi; absent for messages from an older session. */
  durationMs?: number;
  stopReason?: string;
};

/** The parts of a session entry the accounting reads: assistant messages and their usage. */
export type EntryLike = { type: string; message?: MessageLike; usage?: UsageLike };

export type Stats = {
  cost: number;
  /** Hit rate of the latest request that could hit a warm cache, from a model that reports caching. */
  cacheHit: number | undefined;
  /** Tokens a second, from the last completed reply of the current model. */
  speed: number | undefined;
};

/** What a session entry cost, by pi's own accounting across every branch the session took. */
const entryCost = (entry: EntryLike): number => {
  const usd = (usage: UsageLike | undefined) => usage?.cost?.total ?? 0;
  switch (entry.type) {
    case "message":
      return entry.message?.role === "assistant" || entry.message?.role === "toolResult"
        ? usd(entry.message.usage)
        : 0;
    case "usage":
    case "compaction":
    case "branch_summary":
      return usd(entry.usage);
    default:
      return 0;
  }
};

// A short reply is mostly time-to-first-token, and a small prompt makes a hit rate noisy. Only
// show diagnostics once the sample means something.
export const MIN_SPEED_OUTPUT_TOKENS = 100;
export const MIN_CACHE_PROMPT_TOKENS = 2000;
export const MIN_SPEED_MS = 500;

/**
 * Cost, cache health and speed over the session's entries. `model` is the one answering now, so a
 * speed measured for another model is not passed off as this one's.
 */
export const collectStats = (
  entries: readonly EntryLike[],
  model: { provider: string; id: string } | undefined,
): Stats => {
  let cost = 0;
  let cacheHit: number | undefined;
  let lastSpeed: { provider: string; model: string; value: number } | undefined;
  // The first request after a start, a model switch or a compaction can only write the cache, so
  // it says nothing about the hit rate.
  let warmModel: string | undefined;
  // A provider that never reports cache usage would read as a permanent 0% hit rate.
  const caching = new Set<string>();

  for (const entry of entries) {
    cost += entryCost(entry);
    if (entry.type === "compaction" || entry.type === "branch_summary") {
      warmModel = undefined;
      cacheHit = undefined;
      continue;
    }
    const message = entry.type === "message" ? entry.message : undefined;
    if (!message || message.role !== "assistant" || !message.usage) continue;
    const usage = message.usage;
    const key = `${message.provider}/${message.model}`;
    const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
    if (usage.cacheRead + usage.cacheWrite > 0) caching.add(key);
    if (key !== warmModel) {
      warmModel = key;
      cacheHit = undefined;
    } else if (prompt >= MIN_CACHE_PROMPT_TOKENS) {
      cacheHit = (usage.cacheRead / prompt) * 100;
    }
    // Not the entry's timestamp: pi persists a message up to minutes after its stream ends.
    if (
      message.durationMs !== undefined &&
      message.durationMs >= MIN_SPEED_MS &&
      usage.output >= MIN_SPEED_OUTPUT_TOKENS &&
      message.stopReason !== "error" &&
      message.stopReason !== "aborted" &&
      message.provider !== undefined &&
      message.model !== undefined
    )
      lastSpeed = {
        provider: message.provider,
        model: message.model,
        value: usage.output / (message.durationMs / 1000),
      };
  }

  const speed =
    model && lastSpeed?.provider === model.provider && lastSpeed.model === model.id
      ? lastSpeed.value
      : undefined;

  return { cost, cacheHit: warmModel && caching.has(warmModel) ? cacheHit : undefined, speed };
};
