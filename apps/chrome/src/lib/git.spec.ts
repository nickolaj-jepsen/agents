import { describe, expect, it } from "vitest";
import { branchPart, parseStatus } from "./git.ts";

const CLEAN = `# branch.oid 1a2b3c4d5e6f7a8b
# branch.head feature/frame-extract
# branch.upstream origin/feature/frame-extract
# branch.ab +2 -1
`;

describe("git status as the footer reads it", () => {
  it("reads a clean branch, its upstream and how far it is from it", () => {
    expect(parseStatus(CLEAN)).toMatchObject({
      branch: "feature/frame-extract",
      detached: false,
      oid: "1a2b3c4d5e6f7a8b",
      upstream: true,
      ahead: 2,
      behind: 1,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicts: 0,
    });
  });

  it("reads a detached HEAD as its commit", () => {
    const state = parseStatus("# branch.oid 1a2b3c4\n# branch.head (detached)\n");
    expect(state).toMatchObject({ detached: true, branch: null, oid: "1a2b3c4" });
    expect(branchPart(state, null, "full", "cwd")?.text).toBe("\uf417 1a2b3c4");
  });

  it("counts each kind of change, and a conflict in its own column", () => {
    const state = parseStatus(
      `${CLEAN}1 M. N... 100644 100644 100644 1a2b3c4 1a2b3c4 staged.ts\n` +
        "1 .M N... 100644 100644 100644 1a2b3c4 1a2b3c4 worktree.ts\n" +
        "u UU N... 100644 100644 100644 100644 1a2b3c4 1a2b3c4 1a2b3c4 both.ts\n" +
        "? new.ts\n? other/\n",
    );
    expect(state).toMatchObject({ staged: 1, unstaged: 1, conflicts: 1, untracked: 2 });
  });

  it("draws the branch's marks, attached where git's own glyphs are", () => {
    const state = parseStatus(`${CLEAN}1 .M N... 100644 100644 100644 1a2b3c4 1a2b3c4 a.ts\n? b\n`);
    const full = branchPart(state, null, "full", "cwd");
    expect(full?.text).toBe("\uf418 feature/frame-extract* ? ⇡2⇣1");
    // Collapsed, the block keeps its marks and gives up only the name.
    expect(branchPart(state, null, "glyph", "cwd")?.text).toBe("\uf418* ? ⇡2⇣1");
    expect(branchPart(state, null, "none", "cwd")).toBeNull();
  });

  it("keeps the name out of the block when it only repeats the folder", () => {
    // A worktree's folder is named after its branch, so the name would say nothing new.
    const state = parseStatus(CLEAN.replace("feature/frame-extract", "orders"));
    expect(branchPart(state, null, "full", "orders")?.text).toBe("\uf418 ⇡2⇣1");
  });

  it("draws a pull request's glyph in the state it is in", () => {
    const state = parseStatus(CLEAN);
    const pr = { url: "https://example.invalid/pr/7", number: 7, state: "draft" as const };
    expect(branchPart(state, pr, "full", "cwd")?.text).toBe(
      "\uf418 feature/frame-extract \uf4dd ⇡2⇣1",
    );
  });

  it("has nothing to draw outside a repository", () => {
    expect(branchPart(null, null, "full", "cwd")).toBeNull();
  });
});
