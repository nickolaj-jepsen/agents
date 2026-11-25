import { describe, expect, it } from "vitest";
import { beginTurn, duringTurns, endTurn, SLACK_MS, startTurns } from "./turns.ts";
import { bandOf } from "./screen.ts";
import { written, type Group } from "./shelf.ts";

const note = (name: string, at: number) => ({
  id: `plans:${name}`,
  name,
  file: `/s/plans/${name}`,
  kind: "markdown" as const,
  at,
});

describe("turns", () => {
  it("counts a time inside a turn, with the slack at both ends", () => {
    const t = endTurn(beginTurn(startTurns(0), 10_000), 20_000);
    expect(duringTurns(t, 15_000)).toBe(true);
    expect(duringTurns(t, 10_000 - SLACK_MS)).toBe(true);
    expect(duringTurns(t, 20_000 + SLACK_MS)).toBe(true);
    expect(duringTurns(t, 10_000 - SLACK_MS - 1)).toBe(false);
    expect(duringTurns(t, 20_000 + SLACK_MS + 1)).toBe(false);
  });

  it("does not count the time between two turns", () => {
    let t = endTurn(beginTurn(startTurns(0), 10_000), 20_000);
    t = endTurn(beginTurn(t, 60_000), 70_000);
    expect(duringTurns(t, 40_000)).toBe(false);
    expect(duringTurns(t, 65_000)).toBe(true);
  });

  it("keeps the start of a turn a second prompt queued behind", () => {
    const t = endTurn(beginTurn(beginTurn(startTurns(0), 10_000), 15_000), 20_000);
    expect(t.spans).toEqual([{ from: 10_000, to: 20_000 }]);
  });

  it("starts a turn nobody began where the last ended, or where the session did", () => {
    const first = endTurn(startTurns(5_000), 20_000);
    expect(first.spans).toEqual([{ from: 5_000, to: 20_000 }]);
    expect(endTurn(first, 30_000).spans.at(-1)).toEqual({ from: 20_000, to: 30_000 });
  });

  it("drops the turns that ended before the person last looked", () => {
    let t = endTurn(beginTurn(startTurns(0), 10_000), 20_000);
    t = endTurn(beginTurn(t, 100_000), 110_000, 50_000);
    expect(t.spans).toEqual([{ from: 100_000, to: 110_000 }]);
  });

  it("has no time before a turn has ended", () => {
    expect(duringTurns(beginTurn(startTurns(0), 10), 10)).toBe(false);
  });
});

describe("the band over turns", () => {
  const groups: Group[] = [
    {
      label: "plans",
      artefacts: 0,
      notes: [note("other-session.md", 50_000), note("mine.md", 15_000)],
    },
  ];
  const turns = endTurn(beginTurn(startTurns(0), 10_000), 20_000);

  it("counts only the notes written in this session's turns", () => {
    const within = (at: number) => duringTurns(turns, at);
    expect(written(groups, 0, within).map((n) => n.name)).toEqual(["mine.md"]);
    expect(bandOf(groups, 0, within)?.text).toBe("Note written: plans/mine.md");
  });

  it("counts a note another session writes during one of this session's turns", () => {
    const busy: Group[] = [{ label: "plans", artefacts: 0, notes: [note("theirs.md", 12_000)] }];
    expect(bandOf(busy, 0, (at) => duringTurns(turns, at))?.text).toBe(
      "Note written: plans/theirs.md",
    );
  });

  it("says nothing when every note is another session's", () => {
    const theirs: Group[] = [{ label: "plans", artefacts: 0, notes: [note("x.md", 50_000)] }];
    expect(bandOf(theirs, 0, (at) => duringTurns(turns, at))).toBeUndefined();
  });

  it("still ignores what was written before the person looked", () => {
    expect(bandOf(groups, 16_000, (at) => duringTurns(turns, at))).toBeUndefined();
  });
});
