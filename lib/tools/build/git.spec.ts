import { afterEach, describe, expect, it } from "vitest";
import { cleanup, commit, repo, write } from "./fixtures.ts";
import { commitPaths, git, rootOf, status, statusPath } from "./git.ts";

afterEach(cleanup);

describe("git", () => {
  it("finds the root, the status and a status line's path", () => {
    const root = repo();
    write(root, "apps/answer/package.json", "{}\n");
    commit(root, "add answer");
    expect(rootOf(root)).toBe(root);
    expect(status(root)).toEqual([]);

    write(root, "apps/answer/package.json", '{"version":"0.2.0"}\n');
    write(root, "notes.txt", "untracked\n");
    const dirty = status(root);
    expect(dirty).toHaveLength(2);
    expect(dirty.map(statusPath).sort()).toEqual(["apps/answer/package.json", "notes.txt"]);
    expect(statusPath("R  old.ts -> new.ts")).toBe("new.ts");
  });

  it("gives a fixture no config but its own, so nobody's hooks run in one", () => {
    const root = repo();
    const origins = git(root, ["config", "--list", "--show-origin"])
      .split("\n")
      .map((line) => line.split("\t")[0]);
    expect([...new Set(origins)]).toEqual(["file:.git/config"]);
  });

  it("commits the paths it is given and leaves the rest of the tree alone", () => {
    const root = repo();
    write(root, "apps/answer/package.json", "{}\n");
    const first = commit(root, "add answer");
    write(root, "apps/answer/CHANGELOG.md", "# Changelog\n");
    write(root, "apps/answer/notes.txt", "not staged\n");

    commitPaths(root, "release(answer): 0.2.0", ["apps/answer/CHANGELOG.md"]);
    expect(git(root, ["log", "-1", "--format=%s"])).toBe("release(answer): 0.2.0");
    expect(status(root).map(statusPath)).toEqual(["apps/answer/notes.txt"]);
    expect(git(root, ["rev-parse", "HEAD"])).not.toBe(first);
  });

  it("runs with the environment it is handed, and says what git said when it fails", () => {
    const root = repo();
    write(root, "a.txt", "one\n");
    git(root, ["add", "a.txt"]);
    git(root, ["commit", "-q", "-m", "one"], {
      ...process.env,
      GIT_AUTHOR_NAME: "A Bot",
      GIT_COMMITTER_NAME: "A Bot",
    });
    expect(git(root, ["log", "-1", "--format=%an"])).toBe("A Bot");
    expect(() => git(root, ["rev-parse", "no-such-ref^{commit}"])).toThrow(/no-such-ref/);
  });
});
