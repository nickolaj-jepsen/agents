import { describe, expect, it } from "vitest";
import { cellWidth, textOf, widthOf } from "@agents/kit-core/lines.ts";
import type { FooterInput } from "./footer.ts";
import { layoutFooter } from "./footer.ts";
import type { GitState } from "./git.ts";
import { branchPart, parseStatus } from "./git.ts";

const CLEAN = `# branch.oid 1a2b3c4d5e6f
# branch.head feature/frame-extract
# branch.upstream origin/feature/frame-extract
# branch.ab +0 -0
`;

/** The checkout's own name, and the road to it, as the path part is drawn. */
const PATH = "/home/e2e/.local/state/agent-tools-e2e/runs/2026-11-27-abc123/cwd";
/** A checkout in an ordinary folder, for the widths where the whole road still fits. */
const SHALLOW = "/home/e2e/worktrees/agent-tools/checkout";

/** The footer a scenario draws: the fixture's model over a checkout, with the meters beside it. */
const input = (
  state: GitState = parseStatus(CLEAN),
  path = PATH,
  extra: Partial<FooterInput> = {},
): FooterInput => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return {
    provider: { id: "model", text: "fixture", short: "fixture", role: "dim", action: "model" },
    model: {
      id: "model",
      text: "Replay (fixture)",
      short: "Replay (fixture)",
      role: "dim",
      bold: true,
      action: "model",
    },
    effort: { id: "effort", text: "⚡ medium", role: "dim", action: "effort" },
    alarms: [{ id: "cache", text: "cache 0%", role: "error" }],
    cost: { id: "cost", text: "$0.42" },
    speed: { id: "speed", text: "48 t/s" },
    path: {
      id: "path",
      text: path,
      short: name,
      role: "text",
      spans: [
        { text: path.slice(0, path.lastIndexOf("/") + 1), role: "dim" },
        { text: name, role: "text" },
      ],
      action: "open",
    },
    git: (mode) => {
      const drawn = branchPart(state, null, mode, name);
      return drawn ? { ...drawn, action: "git" } : null;
    },
    ...extra,
  };
};

const text = (width: number, state?: GitState, path?: string, extra?: Partial<FooterInput>) =>
  textOf({ spans: layoutFooter(width, input(state, path, extra)).spans });

describe("the footer's line", () => {
  it("keeps the model, the checkout and the branch name at 160 columns", () => {
    const line = text(160);
    expect(line.startsWith("  fixture  Replay (fixture)")).toBe(true);
    expect(line).toContain(PATH);
    expect(line).toContain("feature/frame-extract");
    expect(line).toContain("cache 0%");
    expect(line).toContain("$0.42");
    expect(line).toContain("48 t/s");
  });

  it("keeps the checkout and the branch when 70 columns squeeze the line", () => {
    // Ticket 02 dropped the path first here, leaving the run with nowhere to work.
    const line = text(70);
    expect(line).toContain("Replay (fixture)");
    expect(line).toContain(" cwd");
    expect(line).not.toContain("2026-11-27-abc123");
    expect(line).toContain("feature/frame-extract");
  });

  it("collapses the branch to its glyph before the checkout's own name goes", () => {
    const long = parseStatus(
      CLEAN.replace("feature/frame-extract", "release/2026-11-payments-integration-train-eu"),
    );
    const squeezed = text(70, long);
    expect(squeezed).toContain("Replay (fixture)");
    expect(squeezed).toContain(" cwd");
    expect(squeezed).toContain("\uf418");
    expect(squeezed).not.toContain("release/2026-11");
  });

  it("gives up statuses before it shortens the checkout's path", () => {
    const extra = { statuses: [{ id: "status-0", text: "lint ok", role: "dim" as const }] };
    const wide = text(160, undefined, SHALLOW, extra);
    expect(wide).toContain("lint ok");
    const narrow = text(112, undefined, SHALLOW, extra);
    expect(narrow).not.toContain("lint ok");
    // The road to the checkout is still whole: only the secondary words went.
    expect(narrow).toContain(SHALLOW);
    expect(narrow).toContain("feature/frame-extract");
  });

  it("drops the meters before the path, and the path's road before the model", () => {
    const line = text(70);
    expect(line).toContain("Replay (fixture)");
    expect(line).toContain(" cwd");
    // A deep road is worth less than what the session has cost or how fast it answers.
    expect(line).not.toContain("t/s");
    expect(line).not.toContain("$0.42");
    expect(line).toContain("feature/frame-extract");
    // The alarm is the last secondary word: it says something needs looking at.
    expect(line).toContain("cache 0%");
    const squeezed = text(58);
    // The branch's name goes before the alarm does; the checkout's own name stays.
    expect(squeezed).toContain("cache 0%");
    expect(squeezed).toContain(" cwd");
    expect(squeezed).toContain("\uf418");
    expect(squeezed).not.toContain("feature/frame-extract");
    const cramped = text(30);
    expect(cramped).not.toContain("cache 0%");
    expect(cramped).toContain("Replay");
    expect(cramped).toContain(" cwd");
  });

  it("shows only what it was given: a missing meter is absent, not a zero", () => {
    const bare = text(160, undefined, PATH, {
      cost: undefined,
      speed: undefined,
      alarms: undefined,
      statuses: undefined,
      effort: undefined,
    });
    expect(bare).not.toContain("$");
    expect(bare).not.toContain("t/s");
    expect(bare).not.toContain("cache");
    expect(bare).not.toContain("⚡");
  });

  it("keeps the model when everything else has gone", () => {
    const line = text(24);
    expect(line).toContain("Replay");
    expect(widthOf({ spans: layoutFooter(24, input()).spans })).toBeLessThanOrEqual(24);
  });

  it("never draws wider than it is asked to", () => {
    const long = parseStatus(
      CLEAN.replace("feature/frame-extract", "release/2026-11-payments-integration-train-eu"),
    );
    const wide = parseStatus(CLEAN.replace("feature/frame-extract", "功能/重构分支名称很长"));
    for (const width of [24, 40, 58, 70, 112, 160, 240])
      for (const state of [parseStatus(CLEAN), long, wide])
        for (const path of [undefined, "/tmp/x", PATH])
          for (const extra of [{}, { statuses: [{ id: "s", text: "日本語のステータス" }] }])
            expect(
              widthOf({ spans: layoutFooter(width, input(state, path, extra)).spans }),
            ).toBeLessThanOrEqual(width);
  });

  it("marks each control's cells, and the pointer's part is lit", () => {
    const line = layoutFooter(160, input(), "model");
    // The provider and the model are one target: a click on either opens the picker, then the
    // path, then the whole git block.
    expect(line.regions.map((r) => r.action)).toEqual(["model", "model", "effort", "open", "git"]);
    const lit = line.spans.filter((s) => s.bold && s.role === "text");
    expect(lit.map((s) => s.text.trim())).toEqual(["fixture", "Replay (fixture)"]);
  });

  it("draws a branch's dirty mark and untracked count", () => {
    const dirty = parseStatus(
      `${CLEAN}1 .M N... 100644 100644 100644 1a2b3c4 1a2b3c4 README.md\n? notes.txt\n`,
    );
    // The mark is attached to the name; the count is its own word.
    expect(text(160, dirty)).toContain("\uf418 feature/frame-extract* ?");
  });

  it("measures in cells, so a wide model name cannot overflow", () => {
    const wide = { id: "model", text: "日本語のモデル", role: "dim" as const };
    const line = layoutFooter(20, { model: wide });
    expect(widthOf({ spans: line.spans })).toBeLessThanOrEqual(20);
    expect(widthOf({ spans: line.spans })).toBeGreaterThanOrEqual(cellWidth("日本語のモデル…"));
  });
});
