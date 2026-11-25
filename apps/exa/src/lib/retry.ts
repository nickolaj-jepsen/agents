/**
 * Retries for Exa's transient failures, as its error-code docs ask: 429 waits for `Retry-After`
 * when sent, 500/502/503/504 and network errors back off exponentially, and every other status
 * fails at once. Each attempt has its own timeout; the caller's abort ends everything.
 */

export const MAX_ATTEMPTS = 3;
export const ATTEMPT_TIMEOUT_MS = 60_000;
const BASE_DELAY_MS = 1_000;
// A rate limit that asks for longer than this is not worth holding a tool call open for.
export const MAX_WAIT_MS = 20_000;

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

export const retryable = (status: number) => RETRY_STATUSES.has(status);

/**
 * How long to wait before attempt `attempt + 1` (`attempt` counts from 0), from `Retry-After`
 * (seconds or an HTTP date) when present, else exponential: 1s, 2s, 4s. Undefined when the
 * server asks for longer than `MAX_WAIT_MS`.
 */
export function retryDelay(
  attempt: number,
  retryAfter: string | null | undefined,
  now = Date.now(),
): number | undefined {
  let ms = BASE_DELAY_MS * 2 ** attempt;
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(seconds)) ms = seconds * 1_000;
    else if (Number.isFinite(date)) ms = date - now;
  }
  ms = Math.max(0, ms);
  return ms > MAX_WAIT_MS ? undefined : ms;
}

/** Resolves after `ms`, or rejects with the signal's reason once it aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs `attempt` until it gives a response that is ok or not worth retrying, and returns that
 * response. A network error is retried like a 5xx; an abort by `signal` or a timeout is not.
 */
export async function withRetries(
  attempt: (signal: AbortSignal) => Promise<Response>,
  signal?: AbortSignal,
  wait: (ms: number, signal?: AbortSignal) => Promise<void> = sleep,
  timeoutMs = ATTEMPT_TIMEOUT_MS,
): Promise<Response> {
  for (let n = 0; ; n++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await attempt(combined);
    } catch (err) {
      if (signal?.aborted) throw err;
      if (timeout.aborted) throw new Error(`timed out after ${timeoutMs / 1_000}s`);
      if (n + 1 >= MAX_ATTEMPTS) throw err;
      await wait(retryDelay(n, null) ?? 0, signal);
      continue;
    }
    if (res.ok || !retryable(res.status) || n + 1 >= MAX_ATTEMPTS) return res;
    const delay = retryDelay(n, res.headers.get("retry-after"));
    if (delay === undefined) return res;
    // Free the connection before waiting.
    await res.body?.cancel().catch(() => {});
    await wait(delay, signal);
  }
}
