import { describe, expect, it } from "vitest";
import { beginTurn, endTurn, markLooked, news, SLACK_MS, startSession } from "./session.ts";
import type { Group, Note } from "./shelf.ts";

const note = (name: string, at: number): Note => ({
  id: `plans:${name}`,
  name,
  file: `/s/plans/${name}`,
  kind: "markdown",
  at,
});

/** The store as a walk finds it: the folder `plans`, holding `notes`. */
const plans = (...notes: Note[]): Group[] => [{ label: "plans", notes, artefacts: 0 }];

/** A session that worked one turn, from 10 s to 20 s. */
const worked = () => endTurn(beginTurn(startSession(0), 10_000), 20_000);

describe("a session's news", () => {
  it("is nothing before a turn has ended", () => {
    // A started session has no turn: what the store already held is nobody's news.
    expect(news(startSession(0), plans(note("held.md", 5_000)))).toBeUndefined();
    // A turn under way is not news yet either.
    expect(news(beginTurn(startSession(0), 10_000), plans(note("under-way.md", 15_000)))).toBe(
      undefined,
    );
  });

  it("is the notes a turn wrote, and not the ones written between two of them", () => {
    let session = worked();
    // Written after the session started but before the turn did: another session's, or nobody's.
    expect(news(session, plans(note("before.md", 1)))).toBeUndefined();
    expect(news(session, plans(note("mine.md", 15_000)))?.text).toBe("Note written: plans/mine.md");
    // Another session writes while this one's turn runs: the store cannot say whose it is.
    expect(news(session, plans(note("mine.md", 15_000), note("theirs.md", 12_000)))?.text).toBe(
      "2 notes written, last plans/mine.md",
    );

    session = endTurn(beginTurn(session, 60_000), 70_000);
    // Between two of this session's turns, whatever another session wrote is no news here.
    expect(news(session, plans(note("idle.md", 40_000)))).toBeUndefined();
    expect(news(session, plans(note("again.md", 65_000)))?.text).toBe(
      "Note written: plans/again.md",
    );
  });

  it("gives a turn both ends the file system's clock slack, and not a millisecond more", () => {
    const session = worked();
    expect(news(session, plans(note("early.md", 10_000 - SLACK_MS)))?.text).toBe(
      "Note written: plans/early.md",
    );
    expect(news(session, plans(note("too-early.md", 10_000 - SLACK_MS - 1)))).toBeUndefined();
    expect(news(session, plans(note("late.md", 20_000 + SLACK_MS)))?.text).toBe(
      "Note written: plans/late.md",
    );
    expect(news(session, plans(note("too-late.md", 20_000 + SLACK_MS + 1)))).toBeUndefined();
  });

  it("keeps the start of a turn a second prompt is queued behind", () => {
    const queued = endTurn(beginTurn(beginTurn(startSession(0), 10_000), 15_000), 20_000);
    // Written by the first prompt, before the second was queued: still this one turn's.
    expect(news(queued, plans(note("queued.md", 12_000)))?.text).toBe(
      "Note written: plans/queued.md",
    );
  });

  it("starts a turn nobody began where the last ended, or where the session did", () => {
    let session = endTurn(startSession(5_000), 20_000);
    expect(news(session, plans(note("first.md", 6_000)))?.text).toBe(
      "Note written: plans/first.md",
    );
    session = endTurn(session, 30_000);
    expect(news(session, plans(note("between.md", 25_000)))?.text).toBe(
      "Note written: plans/between.md",
    );
    // Nothing the session started before is news, whichever turn it falls in.
    expect(news(session, plans(note("before.md", 4_000)))).toBeUndefined();
  });

  it("counts a turn nobody began after the person looked from the last turn's end, not the session's", () => {
    let session = worked();
    // Looked long after the turn: more than the slack before the next completion.
    session = markLooked(session, 100_000);
    // A completion no prompt began.
    session = endTurn(session, 150_000);
    // Idle before the last turn began, written in it, and written after it ended: all no news.
    expect(news(session, plans(note("before-turn.md", 5_000)))).toBeUndefined();
    expect(news(session, plans(note("looked-past.md", 15_000)))).toBeUndefined();
    expect(news(session, plans(note("between.md", 50_000)))).toBeUndefined();
    // The turn nobody began is where news starts again.
    expect(news(session, plans(note("now.md", 120_000)))?.text).toBe("Note written: plans/now.md");
  });

  it("keeps every turn when the person looks, moving only the time they looked", () => {
    // Looking must not prune a turn: its end is where a completion nobody began begins, and a note
    // written after the look is news in it however long ago it ended.
    let session = markLooked(worked(), 100_000);
    expect(session.turns.spans).toEqual([{ from: 10_000, to: 20_000 }]);
    session = endTurn(session, 150_000);
    // The turn nobody began began where the one before it ended, not where the session did; only
    // the turn that ended before the look is dropped, by the end that made the new one.
    expect(session.turns.spans).toEqual([{ from: 20_000, to: 150_000 }]);
  });

  it("counts from when the person looked, in the turn they looked in and after it", () => {
    let session = worked();
    session = markLooked(session, 16_000);
    expect(news(session, plans(note("seen.md", 15_000)))).toBeUndefined();
    expect(news(session, plans(note("later.md", 18_000)))?.text).toBe(
      "Note written: plans/later.md",
    );

    // Dismissed after the turn: what it wrote is no news, and the next turn's is.
    session = markLooked(session, 25_000);
    expect(news(session, plans(note("later.md", 18_000)))).toBeUndefined();
    session = endTurn(beginTurn(session, 100_000), 110_000);
    expect(news(session, plans(note("next.md", 105_000)))?.text).toBe(
      "Note written: plans/next.md",
    );
  });

  it("forgets a session's turns when a session starts", () => {
    let session = worked();
    expect(news(session, plans(note("old.md", 15_000)))?.text).toBe("Note written: plans/old.md");
    session = startSession(100_000);
    expect(news(session, plans(note("old.md", 15_000)))).toBeUndefined();
    expect(news(session, plans(note("now.md", 100_001)))).toBeUndefined();
    session = endTurn(beginTurn(session, 101_000), 102_000);
    expect(news(session, plans(note("next.md", 101_500)))?.text).toBe(
      "Note written: plans/next.md",
    );
  });

  it("is never the harness's memory, which no agent wrote", () => {
    const memory: Group = {
      label: "memory",
      notes: [note("MEMORY.md", 15_000)],
      artefacts: 0,
      isMemory: true,
    };
    expect(news(worked(), [memory])).toBeUndefined();
  });
});
