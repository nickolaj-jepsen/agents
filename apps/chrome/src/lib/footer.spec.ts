import { describe, expect, it } from "vitest";
import { cellWidth, textOf, widthOf } from "@agents/kit-core/lines.ts";
import type { Part } from "./footer.ts";
import { layoutFooter } from "./footer.ts";
import type { GitState } from "./git.ts";
import { branchPart, parseStatus } from "./git.ts";

const CLEAN = `# branch.oid 1a2b3c4d5e6f
# branch.head feature/frame-extract
# branch.upstream origin/feature/frame-extract
# branch.ab +0 -0
`;

const part = (text: string, extra: Partial<Part> = {}): Part => ({ id: "model", text, ...extra });

/** The footer a scenario draws: the fixture's model over a checkout under /tmp and one branch. */
const input = (state: GitState = parseStatus(CLEAN), path = "/tmp/e2e-abc123/cwd") => ({
  provider: part("fixture", { short: "fixture", role: "dim" as const, action: "model" }),
  model: part("Replay (fixture)", {
    short: "Replay (fixture)",
    role: "dim" as const,
    bold: true,
    action: "model",
  }),
  path: { id: "path", text: path, action: "open" },
  git: (mode: "full" | "glyph" | "none") => {
    const drawn = branchPart(state, null, mode, "cwd");
    return drawn ? { ...drawn, action: "git" } : null;
  },
});

const text = (width: number, state?: GitState, path?: string) =>
  textOf({ spans: layoutFooter(width, input(state, path)).spans });

describe("the footer's line", () => {
  it("keeps the model, the checkout and the branch name at 160 columns", () => {
    const line = text(160);
    expect(line.startsWith("  fixture  Replay (fixture)")).toBe(true);
    expect(line).toContain("/tmp/e2e-abc123/cwd");
    expect(line).toContain("feature/frame-extract");
    expect(widthOf({ spans: layoutFooter(160, input()).spans })).toBeLessThanOrEqual(160);
  });

  it("gives up the path before the branch's name when the line is squeezed", () => {
    const narrow = text(70);
    expect(narrow).not.toContain("/tmp/e2e-abc123/cwd");
    expect(narrow).toContain("feature/frame-extract");
  });

  it("collapses the branch to its glyph when its name does not fit either", () => {
    const long = parseStatus(CLEAN.replace("feature/frame-extract", "release/2026-11-payments"));
    expect(text(70, long)).toContain("release/2026-11-payments");
    const squeezed = text(50, long);
    expect(squeezed).not.toContain("release/2026-11-payments");
    expect(squeezed).toContain("\uf418");
  });

  it("never draws wider than it is asked to", () => {
    const long = parseStatus(CLEAN.replace("feature/frame-extract", "release/2026-11-payments"));
    for (const width of [24, 40, 58, 70, 112, 160, 240])
      for (const state of [parseStatus(CLEAN), long])
        for (const path of [undefined, "/tmp/x", "/home/e2e/worktrees/agents/agents/checkout"])
          expect(
            widthOf({ spans: layoutFooter(width, input(state, path)).spans }),
          ).toBeLessThanOrEqual(width);
  });

  it("marks each control's cells, and the pointer's part is lit", () => {
    const line = layoutFooter(160, input(), "model");
    // The provider and the model are one target: a click on either opens the picker, then the
    // path, then the whole git block.
    expect(line.regions.map((r) => r.action)).toEqual(["model", "model", "open", "git"]);
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
    const wide: Part = { id: "model", text: "日本語のモデル", role: "dim" };
    const line = layoutFooter(20, { model: wide });
    expect(widthOf({ spans: line.spans })).toBeLessThanOrEqual(20);
    expect(widthOf({ spans: line.spans })).toBeGreaterThanOrEqual(cellWidth("日本語のモデル…"));
  });
});
