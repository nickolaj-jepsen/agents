import { describe, expect, test } from "vitest";

import { MAX_ATTEMPTS, retryDelay, withRetries } from "./retry.ts";

const reply = (status: number, headers: Record<string, string> = {}) =>
  new Response(status === 200 ? "{}" : "nope", { status, headers });

/** An attempt function that answers from `script` in turn, and the waits it was asked for. */
function scripted(script: (Response | Error)[]) {
  const waits: number[] = [];
  let calls = 0;
  const attempt = async () => {
    const next = script[calls++];
    if (!next) throw new Error("script ran out");
    if (next instanceof Error) throw next;
    return next;
  };
  const wait = async (ms: number) => {
    waits.push(ms);
  };
  return { attempt, wait, waits, calls: () => calls };
}

describe("retryDelay", () => {
  test("backs off exponentially without Retry-After", () => {
    expect([0, 1, 2].map((n) => retryDelay(n, null))).toEqual([1_000, 2_000, 4_000]);
  });

  test("takes Retry-After in seconds or as a date", () => {
    expect(retryDelay(0, "3")).toBe(3_000);
    const now = Date.parse("2026-11-25T12:00:00Z");
    expect(retryDelay(0, "Wed, 25 Nov 2026 12:00:05 GMT", now)).toBe(5_000);
  });

  test("gives up on a wait longer than the tool should hold", () => {
    expect(retryDelay(0, "120")).toBeUndefined();
  });
});

describe("withRetries", () => {
  test("returns the first ok response without waiting", async () => {
    const s = scripted([reply(200)]);
    expect((await withRetries(s.attempt, undefined, s.wait)).status).toBe(200);
    expect(s.waits).toEqual([]);
  });

  test("retries a 429 after Retry-After and a 503 with backoff", async () => {
    const s = scripted([reply(429, { "retry-after": "2" }), reply(503), reply(200)]);
    expect((await withRetries(s.attempt, undefined, s.wait)).status).toBe(200);
    expect(s.waits).toEqual([2_000, 2_000]);
  });

  test("does not retry other client errors", async () => {
    const s = scripted([reply(402), reply(200)]);
    expect((await withRetries(s.attempt, undefined, s.wait)).status).toBe(402);
    expect(s.calls()).toBe(1);
  });

  test("returns the last failure once attempts run out", async () => {
    const s = scripted(Array.from({ length: MAX_ATTEMPTS + 1 }, () => reply(500)));
    expect((await withRetries(s.attempt, undefined, s.wait)).status).toBe(500);
    expect(s.calls()).toBe(MAX_ATTEMPTS);
  });

  test("returns a 429 at once when it asks for too long a wait", async () => {
    const s = scripted([reply(429, { "retry-after": "600" }), reply(200)]);
    expect((await withRetries(s.attempt, undefined, s.wait)).status).toBe(429);
    expect(s.calls()).toBe(1);
  });

  test("retries a network error", async () => {
    const s = scripted([new TypeError("fetch failed"), reply(200)]);
    expect((await withRetries(s.attempt, undefined, s.wait)).status).toBe(200);
  });

  test("does not retry once the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stopped"));
    const s = scripted([new Error("aborted"), reply(200)]);
    await expect(withRetries(s.attempt, controller.signal, s.wait)).rejects.toThrow("aborted");
    expect(s.calls()).toBe(1);
  });

  test("reports a timed-out attempt", async () => {
    const attempt = (signal: AbortSignal) =>
      new Promise<Response>((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason)),
      );
    await expect(withRetries(attempt, undefined, async () => {}, 10)).rejects.toThrow(
      "timed out after 0.01s",
    );
  });
});
