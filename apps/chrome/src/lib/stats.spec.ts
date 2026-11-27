/**
 * What the session's own record says it cost, how its cache held and how fast it answered. These
 * are pi's numbers, not the host's: nothing here reaches a provider or reads an account.
 */
import { describe, expect, it } from "vitest";
import { collectStats, type EntryLike } from "./stats.ts";

const MODEL = { provider: "fixture", id: "replay" };

const assistant = (
  usage: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    cost?: number;
  },
  extra: { durationMs?: number; stopReason?: string; provider?: string; model?: string } = {},
): EntryLike => ({
  type: "message",
  message: {
    role: "assistant",
    provider: extra.provider ?? MODEL.provider,
    model: extra.model ?? MODEL.id,
    stopReason: extra.stopReason ?? "stop",
    ...(extra.durationMs === undefined ? {} : { durationMs: extra.durationMs }),
    usage: {
      input: usage.input ?? 0,
      output: usage.output ?? 0,
      cacheRead: usage.cacheRead ?? 0,
      cacheWrite: usage.cacheWrite ?? 0,
      cost: { total: usage.cost ?? 0 },
    },
  },
});

describe("what the session has cost", () => {
  it("adds up every entry pi priced, including compaction and an abandoned branch", () => {
    expect(
      collectStats(
        [
          assistant({ cost: 0.004 }, {}),
          {
            type: "usage",
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: { total: 0.1 } },
          },
          {
            type: "compaction",
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: { total: 0.02 } },
          },
          {
            type: "branch_summary",
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: { total: 0.03 } },
          },
          { type: "message", message: { role: "user" } },
        ],
        MODEL,
      ).cost,
    ).toBeCloseTo(0.154);
  });

  it("is zero, not missing, for a session that has spent nothing", () => {
    expect(collectStats([], MODEL).cost).toBe(0);
  });
});

describe("the provider's cache", () => {
  it("is not reported until a second request could have hit it", () => {
    const first = collectStats([assistant({ input: 0, cacheRead: 3000 })], MODEL);
    expect(first.cacheHit).toBeUndefined();
  });

  it("reports the hit rate of the request after the warm-up", () => {
    const stats = collectStats(
      [assistant({ input: 0, cacheRead: 3000 }), assistant({ input: 300, cacheRead: 2700 })],
      MODEL,
    );
    expect(stats.cacheHit).toBeCloseTo(90);
  });

  it("reports a miss as zero, so a broken cache is visible", () => {
    const stats = collectStats(
      [assistant({ input: 0, cacheRead: 3000 }), assistant({ input: 3000, cacheRead: 0 })],
      MODEL,
    );
    expect(stats.cacheHit).toBe(0);
  });

  it("stays absent for a model that never reports cache usage", () => {
    const stats = collectStats(
      [assistant({ input: 3000 }), assistant({ input: 3000, cacheRead: 0 })],
      MODEL,
    );
    expect(stats.cacheHit).toBeUndefined();
  });

  it("forgets the rate across a compaction, which rewrites the context", () => {
    const stats = collectStats(
      [
        assistant({ input: 0, cacheRead: 3000 }),
        assistant({ input: 300, cacheRead: 2700 }),
        { type: "compaction" },
      ],
      MODEL,
    );
    expect(stats.cacheHit).toBeUndefined();
  });
});

describe("how fast the model answered", () => {
  it("reads the last reply that took long enough to measure", () => {
    const stats = collectStats([assistant({ output: 250 }, { durationMs: 1000 })], MODEL);
    expect(stats.speed).toBeCloseTo(250);
  });

  it("ignores a reply too short to say anything", () => {
    expect(
      collectStats([assistant({ output: 40 }, { durationMs: 2000 })], MODEL).speed,
    ).toBeUndefined();
    expect(
      collectStats([assistant({ output: 250 }, { durationMs: 100 })], MODEL).speed,
    ).toBeUndefined();
  });

  it("ignores an aborted reply", () => {
    expect(
      collectStats([assistant({ output: 400 }, { durationMs: 1500, stopReason: "aborted" })], MODEL)
        .speed,
    ).toBeUndefined();
  });

  it("is absent after switching to another model", () => {
    const stats = collectStats([assistant({ output: 250 }, { durationMs: 1000 })], {
      provider: "fixture",
      id: "replay-two",
    });
    expect(stats.speed).toBeUndefined();
  });
});
