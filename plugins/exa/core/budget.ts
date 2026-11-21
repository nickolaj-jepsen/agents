/**
 * How much of the model's context one Exa call may add, and how that is split across results or
 * pages. Sizes are characters, at four to a token.
 */

// A call may spend at most this share of the window or of the free context.
const WINDOW_SHARE = 0.06;
const FREE_SHARE = 0.25;
const MIN_TOTAL_CHARS = 4_000;
const MAX_TOTAL_CHARS = 120_000;
export const DEFAULT_SEARCH_CHARS = 8_000;
export const MAX_PAGE_CHARS = 30_000;
const MIN_PAGE_CHARS = 1_500;

/**
 * Total chars one call may add to the context, and the window it was reckoned from. `tokens` is
 * what the context already holds, unknown when null or missing: half the window is then taken as free.
 */
export function contextBudget(window: number, tokens?: number | null) {
  const free = tokens == null ? window / 2 : Math.max(0, window - tokens);
  const share = Math.min(window * WINDOW_SHARE, free * FREE_SHARE) * 4;
  return {
    window,
    total: Math.min(MAX_TOTAL_CHARS, Math.max(MIN_TOTAL_CHARS, Math.floor(share))),
  };
}

/** How many results a search asks for by default: fewer on a small window. */
export const resultCount = (window: number) =>
  window >= 500_000 ? 10 : window >= 150_000 ? 8 : window >= 64_000 ? 5 : 3;

/** The per-result cap of a search: `maxChars` or the default, never more than an even share of `total`. */
export const searchCap = (total: number, numResults: number, maxChars?: number) =>
  Math.max(1, Math.min(maxChars ?? DEFAULT_SEARCH_CHARS, Math.floor(total / numResults)));

/**
 * How a fetch of `urlCount` pages fits `total`: how many pages it reads, and the cap on each. A
 * page is read in at least `MIN_PAGE_CHARS`, so a small budget reads fewer pages rather than
 * cutting every one to nothing.
 */
export function fetchPlan(total: number, urlCount: number, maxChars?: number) {
  const pageCap = Math.max(1, Math.min(maxChars ?? MAX_PAGE_CHARS, MAX_PAGE_CHARS));
  const maxPages = Math.max(
    1,
    Math.min(urlCount, Math.floor(total / Math.min(pageCap, MIN_PAGE_CHARS))),
  );
  const perPage = Math.max(1, Math.min(pageCap, Math.floor(total / maxPages)));
  return { maxPages, perPage };
}
