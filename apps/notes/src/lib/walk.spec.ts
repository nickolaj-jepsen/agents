import { describe, expect, it } from "vitest";
import { walk, type Listed, type Lister } from "./walk.ts";

const file = (name: string, mtimeMs = 1): Listed => ({ name, kind: "file", mtimeMs });
const dir = (name: string): Listed => ({ name, kind: "dir", mtimeMs: 0 });

/** A lister over a tree of folders by path, and the folders it was asked for. */
function tree(folders: Record<string, Listed[]>) {
  const asked: string[] = [];
  const list: Lister = async (path) => {
    asked.push(path);
    const entries = folders[path];
    if (!entries) throw new Error(`ENOENT: ${path}`);
    return entries;
  };
  return { list, asked };
}

describe("walk", () => {
  it("finds every file under the root by its path below it, links and dot folders left out", async () => {
    const { list, asked } = tree({
      "/s": [
        file("README.md", 5),
        dir("plans"),
        dir(".cache"),
        { name: "link", kind: "other", mtimeMs: 0 },
      ],
      "/s/plans": [file("a.md", 2), dir("hub")],
      "/s/plans/hub": [file("PLAN.md", 3)],
      "/s/.cache": [file("x.md")],
    });
    expect(await walk(list, "/s")).toEqual([
      { path: "README.md", mtimeMs: 5 },
      { path: "plans/a.md", mtimeMs: 2 },
      { path: "plans/hub/PLAN.md", mtimeMs: 3 },
    ]);
    expect(asked).not.toContain("/s/.cache");
  });

  it("counts a folder it cannot read as empty", async () => {
    const { list } = tree({ "/s": [dir("locked"), file("a.md")] });
    expect(await walk(list, "/s")).toEqual([{ path: "a.md", mtimeMs: 1 }]);
    expect(await walk(list, "/gone")).toEqual([]);
  });

  it("goes a level at a time, so a cut walk keeps the files nearest the root", async () => {
    const { list, asked } = tree({
      "/s": [dir("b"), dir("a"), file("top.md")],
      "/s/a": [file("1.md"), file("2.md"), dir("deep")],
      "/s/b": [file("3.md")],
      "/s/a/deep": [file("4.md")],
    });
    expect((await walk(list, "/s", { depth: 8, files: 3 })).map((e) => e.path)).toEqual([
      "top.md",
      "a/1.md",
      "a/2.md",
    ]);
    // The folders of a level are taken in name order.
    expect(asked.slice(0, 3)).toEqual(["/s", "/s/a", "/s/b"]);
    expect((await walk(list, "/s", { depth: 1, files: 100 })).map((e) => e.path)).toEqual([
      "top.md",
      "a/1.md",
      "a/2.md",
      "b/3.md",
    ]);
  });
});
