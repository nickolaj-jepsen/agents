import { describe, expect, it } from "vitest";
import {
  age,
  artefactsLabel,
  claudeMemoryDir,
  isWalked,
  memoryGroup,
  notesOf,
  shelve,
  written,
  writtenLabel,
} from "./shelf.ts";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 25, 12);
const at = (hoursAgo: number) => NOW - hoursAgo * HOUR;

const STORE = [
  { path: "plans/retry-after.md", mtimeMs: at(1) },
  { path: "plans/hub/PLAN.md", mtimeMs: at(30) },
  { path: "plans/hub/history/PLAN-1.md", mtimeMs: at(40) },
  { path: "plans/hub/diagram.png", mtimeMs: at(30) },
  { path: "findings/bg.md", mtimeMs: at(5) },
  { path: "reports/Evaluating skills.HTML", mtimeMs: at(3) },
  { path: "screens/kit/list@70x24.png", mtimeMs: at(2) },
  { path: "screens/kit/list@160x45.png", mtimeMs: at(2) },
  { path: "README.md", mtimeMs: at(500) },
  { path: ".cache/index.md", mtimeMs: at(0) },
  { path: "plans/.draft/x.md", mtimeMs: at(0) },
];

describe("shelve", () => {
  const groups = shelve("/s", STORE);

  it("groups by top-level folder, the one written to last first, folders with no notes last", () => {
    expect(groups.map((g) => g.label)).toEqual([
      "plans",
      "reports",
      "findings",
      "store",
      "screens",
    ]);
  });

  it("lists a group's notes newest first, by their path below it", () => {
    const plans = groups[0];
    expect(plans?.notes.map((n) => n.name)).toEqual(["retry-after.md", "hub/PLAN.md"]);
    expect(plans?.notes[1]).toEqual({
      id: "plans:plans/hub/PLAN.md",
      name: "hub/PLAN.md",
      file: "/s/plans/hub/PLAN.md",
      kind: "markdown",
      at: at(30),
    });
  });

  it("counts superseded copies and other files as artefacts, and skips dot folders", () => {
    expect(groups.map((g) => [g.label, g.artefacts])).toEqual([
      ["plans", 2],
      ["reports", 0],
      ["findings", 0],
      ["store", 0],
      ["screens", 2],
    ]);
    expect(notesOf(groups).some((n) => n.file.includes("/."))).toBe(false);
  });

  it("knows an HTML note, and one in no folder", () => {
    expect(groups[1]?.notes[0]?.kind).toBe("html");
    expect(groups[3]?.notes[0]).toMatchObject({ name: "README.md", file: "/s/README.md" });
  });

  it("is empty for an empty store", () => {
    expect(shelve("/s", [])).toEqual([]);
  });
});

describe("memoryGroup", () => {
  it("is the memory folder's Markdown, newest first, or nothing", () => {
    const group = memoryGroup("/m", [
      { path: "MEMORY.md", mtimeMs: at(9) },
      { path: "shell-guard.md", mtimeMs: at(2) },
      { path: "index.json", mtimeMs: at(1) },
    ]);
    expect(group).toMatchObject({ label: "memory", isMemory: true, artefacts: 0 });
    expect(group?.notes.map((n) => n.name)).toEqual(["shell-guard.md", "MEMORY.md"]);
    expect(memoryGroup("/m", [{ path: "index.json", mtimeMs: 0 }])).toBeUndefined();
  });
});

describe("written", () => {
  const memory = memoryGroup("/m", [{ path: "MEMORY.md", mtimeMs: at(0) }]);
  const groups = [...shelve("/s", STORE), ...(memory ? [memory] : [])];

  it("is the store's notes since a time, newest first, without memory", () => {
    expect(written(groups, at(4)).map((n) => n.name)).toEqual([
      "retry-after.md",
      "Evaluating skills.HTML",
    ]);
    expect(written(groups, NOW)).toEqual([]);
  });

  it("names one note by its path, and several by their count and the last", () => {
    expect(writtenLabel(written(groups, at(2)), groups)).toBe("Note written: plans/retry-after.md");
    expect(writtenLabel(written(groups, at(4)), groups)).toBe(
      "2 notes written, last plans/retry-after.md",
    );
    expect(writtenLabel([], groups)).toBeUndefined();
    const loose = shelve("/s", [{ path: "README.md", mtimeMs: at(0) }]);
    expect(writtenLabel(written(loose, at(1)), loose)).toBe("Note written: README.md");
  });
});

describe("the small words", () => {
  it("says an age in the fewest letters", () => {
    expect(
      [0, 59_000, 60_000, 59 * 60_000, HOUR, 23 * HOUR, 24 * HOUR, 400 * HOUR].map(age),
    ).toEqual(["now", "now", "1m", "59m", "1h", "23h", "1d", "16d"]);
  });

  it("counts artefacts in words", () => {
    expect([0, 1, 361].map(artefactsLabel)).toEqual([undefined, "1 artefact", "361 artefacts"]);
  });

  it("walks every folder but a dot folder", () => {
    expect(["plans", "history", ".git"].map(isWalked)).toEqual([true, true, false]);
  });

  it("finds Claude Code's memory folder for a checkout", () => {
    expect(claudeMemoryDir("/home/me/.claude", "/home/me/dev/my.repo")).toBe(
      "/home/me/.claude/projects/-home-me-dev-my-repo/memory",
    );
  });
});
