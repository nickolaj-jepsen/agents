import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureArgv, hasStore, ID_FILE, noticeOf, readEnsure, storeRoot } from "./store.ts";

// The person's own git config, hooks and ignore file stay out of the fixture repositories.
const env = {
  ...process.env,
  XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), "notes-xdg-")),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { env, encoding: "utf8" });

/** A scratch folder with a repository `repo` in it and a `stores` folder beside it. */
function world(name = "repo") {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "notes-store-")));
  const repo = join(base, name);
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  git(
    repo,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.invalid",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "start",
  );
  return { base, repo, stores: join(base, "stores") };
}

const ensure = (cwd: string, stores: string) => {
  const [command, ...args] = ensureArgv(cwd, stores);
  return readEnsure(execFileSync(command as string, args, { env, encoding: "utf8" }));
};

/** The script run in the background, for runs that start at once. */
const ensureAsync = (cwd: string, stores: string, extra: Record<string, string> = {}) =>
  new Promise<ReturnType<typeof readEnsure>>((resolve, reject) => {
    const [command, ...args] = ensureArgv(cwd, stores);
    execFile(
      command as string,
      args,
      { env: { ...env, ...extra }, encoding: "utf8" },
      (error, stdout) => (error ? reject(error) : resolve(readEnsure(stdout))),
    );
  });

const dirnameOf = (file: string) => file.slice(0, file.lastIndexOf("/"));

const legacyId = (main: string) =>
  `${basename(main)}-${createHash("sha256").update(main).digest("hex").slice(0, 8)}`;

describe("storeRoot", () => {
  it("is under XDG_DATA_HOME, else ~/.local/share", () => {
    expect(storeRoot({ XDG_DATA_HOME: "/x", HOME: "/h" })).toBe("/x/agents/store");
    expect(storeRoot({ HOME: "/h" })).toBe("/h/.local/share/agents/store");
    expect(storeRoot({})).toBeUndefined();
  });

  it("ignores a relative XDG_DATA_HOME, as the XDG spec says", () => {
    expect(storeRoot({ XDG_DATA_HOME: "data", HOME: "/h" })).toBe("/h/.local/share/agents/store");
    expect(storeRoot({ HOME: "h" })).toBeUndefined();
  });
});

describe("the ensure script", () => {
  it("names a new repository as agent-notes did, links it and hides the link from git", () => {
    const { repo, stores } = world();
    const first = ensure(repo, stores);
    expect(first).toMatchObject({ state: "linked", id: legacyId(repo), root: repo });
    expect(first.store).toBe(join(stores, legacyId(repo)));
    expect(readlinkSync(join(repo, ".agents/store"))).toBe(first.store);
    expect(readFileSync(join(repo, ".git", ID_FILE), "utf8")).toBe(`${legacyId(repo)}\n`);
    expect(git(repo, "status", "--porcelain")).toBe("");
    expect(noticeOf(first)).toBeUndefined();

    // A second run finds everything in place and writes nothing twice.
    expect(ensure(join(repo, ".agents"), stores).state).toBe("ok");
    expect(
      readFileSync(join(repo, ".git/info/exclude"), "utf8").match(/\/\.agents\/store/g),
    ).toHaveLength(1);
  });

  it("gives every worktree the main checkout's store", () => {
    const { base, repo, stores } = world();
    const tree = join(base, "tree");
    git(repo, "worktree", "add", "-q", tree, "-b", "side");
    // Asked from the worktree first: the name is still the main checkout's.
    const side = ensure(tree, stores);
    expect(side).toMatchObject({ state: "linked", id: legacyId(repo), root: tree, main: repo });
    expect(ensure(repo, stores).store).toBe(side.store);
    expect(git(tree, "status", "--porcelain")).toBe("");
  });

  it("keeps the store when the repository moves", () => {
    const { base, repo, stores } = world();
    const before = ensure(repo, stores);
    writeFileSync(join(repo, ".agents/store/plan.md"), "# plan\n");
    const moved = join(base, "elsewhere");
    renameSync(repo, moved);
    const after = ensure(moved, stores);
    expect(after).toMatchObject({ state: "ok", id: before.id });
    expect(existsSync(join(moved, ".agents/store/plan.md"))).toBe(true);
  });

  it("takes a name already written, and ignores one that is no name", () => {
    const { repo, stores } = world();
    writeFileSync(join(repo, ".git", ID_FILE), "handbook-f0e8295a\n");
    expect(ensure(repo, stores).id).toBe("handbook-f0e8295a");
    const other = world();
    writeFileSync(join(other.repo, ".git", ID_FILE), "..\n");
    expect(ensure(other.repo, other.stores).id).toBe(legacyId(other.repo));
  });

  it("names a folder with spaces and other characters safely", () => {
    const { repo, stores } = world("my repo (copy)");
    const made = ensure(repo, stores);
    expect(made.id).toMatch(/^my-repo-copy-[0-9a-f]{8}$/);
    expect(made.state).toBe("linked");
  });

  it("moves an untracked folder's files into the store and links it", () => {
    const { repo, stores } = world();
    const store = join(stores, legacyId(repo));
    mkdirSync(join(store, "plans"), { recursive: true });
    writeFileSync(join(store, "plans/old.md"), "old\n");
    mkdirSync(join(repo, ".agents/store/plans/deep"), { recursive: true });
    writeFileSync(join(repo, ".agents/store/plans/new.md"), "new\n");
    writeFileSync(join(repo, ".agents/store/plans/deep/more.md"), "more\n");
    writeFileSync(join(repo, ".agents/store/.hidden"), "h\n");

    const made = ensure(repo, stores);
    expect(made).toMatchObject({ state: "adopted", count: 3 });
    expect(lstatSync(join(repo, ".agents/store")).isSymbolicLink()).toBe(true);
    for (const file of ["plans/old.md", "plans/new.md", "plans/deep/more.md", ".hidden"])
      expect(existsSync(join(store, file)), file).toBe(true);
    expect(noticeOf(made)).toMatch(/^Moved 3 files/);
  });

  it("counts the files of a folder moved whole", () => {
    const { repo, stores } = world();
    mkdirSync(join(repo, ".agents/store/plans/a"), { recursive: true });
    for (const name of ["1.md", "2.md", "3.md", "4.md", "5.md"])
      writeFileSync(join(repo, ".agents/store/plans/a", name), "x\n");
    expect(ensure(repo, stores)).toMatchObject({ state: "adopted", count: 5 });
  });

  it("moves nothing when a name clashes, and says how many clash", () => {
    const { repo, stores } = world();
    const store = join(stores, legacyId(repo));
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, "plan.md"), "theirs\n");
    mkdirSync(join(repo, ".agents/store"), { recursive: true });
    writeFileSync(join(repo, ".agents/store/plan.md"), "mine\n");
    writeFileSync(join(repo, ".agents/store/other.md"), "other\n");

    const made = ensure(repo, stores);
    expect(made).toMatchObject({ state: "conflict", count: 1 });
    expect(readFileSync(join(store, "plan.md"), "utf8")).toBe("theirs\n");
    expect(readFileSync(join(repo, ".agents/store/plan.md"), "utf8")).toBe("mine\n");
    // Every file stays where the agent wrote it, so nothing it reads next has gone.
    expect(readFileSync(join(repo, ".agents/store/other.md"), "utf8")).toBe("other\n");
    expect(existsSync(join(store, "other.md"))).toBe(false);
    expect(hasStore(made)).toBe(true);
    expect(noticeOf(made)).toMatch(/nothing was moved/);
  });

  it("leaves the folder alone when git cannot say what it tracks", () => {
    const { repo, stores } = world();
    mkdirSync(join(repo, ".agents/store"), { recursive: true });
    writeFileSync(join(repo, ".agents/store/kept.md"), "kept\n");
    writeFileSync(join(repo, ".git/index"), "not an index");
    expect(ensure(repo, stores).state).toBe("tracked");
    expect(readFileSync(join(repo, ".agents/store/kept.md"), "utf8")).toBe("kept\n");
  });

  it("links the folder it runs in, whatever GIT_DIR and GIT_WORK_TREE say", async () => {
    const { repo, stores } = world();
    const other = world("other");
    const made = await ensureAsync(repo, stores, {
      GIT_DIR: join(other.repo, ".git"),
      GIT_WORK_TREE: other.repo,
    });
    expect(made).toMatchObject({ state: "linked", root: repo, id: legacyId(repo) });
    expect(existsSync(join(other.repo, ".agents"))).toBe(false);
    expect(existsSync(join(other.repo, ".git", ID_FILE))).toBe(false);
  });

  it("takes over a lock left by a run that was killed", () => {
    const { repo, stores } = world();
    const lock = join(stores, `.${legacyId(repo)}.lock`);
    mkdirSync(lock, { recursive: true });
    const old = new Date(Date.now() - 5 * 60_000);
    utimesSync(lock, old, old);
    expect(ensure(repo, stores).state).toBe("linked");
    expect(existsSync(lock)).toBe(false);
  });

  it("takes over a lock whose run has ended", () => {
    const { repo, stores } = world();
    const lock = join(stores, `.${legacyId(repo)}.lock`);
    mkdirSync(lock, { recursive: true });
    // A pid that has just exited: the run that held the lock is gone.
    const gone = Number(execFileSync("sh", ["-c", "sh -c 'echo $$'"], { encoding: "utf8" }));
    writeFileSync(join(lock, "pid"), `${gone}\n`);
    expect(ensure(repo, stores).state).toBe("linked");
    expect(existsSync(lock)).toBe(false);
  });

  it("says busy, within a few seconds, while a live run holds the lock", () => {
    const { repo, stores } = world();
    const lock = join(stores, `.${legacyId(repo)}.lock`);
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, "pid"), `${process.pid}\n`);
    const started = Date.now();
    const made = ensure(repo, stores);
    expect(made.state).toBe("busy");
    expect(Date.now() - started).toBeLessThan(7_000);
    expect(hasStore(made)).toBe(false);
    expect(existsSync(join(repo, ".agents/store"))).toBe(false);
    expect(readFileSync(join(lock, "pid"), "utf8")).toBe(`${process.pid}\n`);
  });

  it("loses no file when sessions take over one dead lock at once", async () => {
    for (let round = 0; round < 8; round++) {
      const { base, repo, stores } = world();
      const checkouts = [repo];
      for (const name of ["one", "two"]) {
        const tree = join(base, name);
        git(repo, "worktree", "add", "-q", tree, "-b", name);
        checkouts.push(tree);
      }
      for (const [i, checkout] of checkouts.entries()) {
        mkdirSync(join(checkout, ".agents/store"), { recursive: true });
        writeFileSync(join(checkout, ".agents/store/plan.md"), `from ${i}\n`);
      }
      const store = join(stores, legacyId(repo));
      const lock = join(stores, `.${legacyId(repo)}.lock`);
      mkdirSync(lock, { recursive: true });
      const old = new Date(Date.now() - 5 * 60_000);
      utimesSync(lock, old, old);
      await Promise.all(checkouts.map((checkout) => ensureAsync(checkout, stores)));
      const kept = [store, ...checkouts.map((checkout) => join(checkout, ".agents/store"))]
        .map((folder) => join(folder, "plan.md"))
        .filter((file, i) => i === 0 || !lstatSync(dirnameOf(file)).isSymbolicLink())
        .filter((file) => existsSync(file))
        .map((file) => readFileSync(file, "utf8"))
        .sort();
      expect(kept).toEqual(["from 0\n", "from 1\n", "from 2\n"]);
    }
  });

  it("loses no file when sessions start at once in two worktrees", async () => {
    for (let round = 0; round < 5; round++) {
      const { base, repo, stores } = world();
      const tree = join(base, "tree");
      git(repo, "worktree", "add", "-q", tree, "-b", "side");
      for (const [checkout, text] of [
        [repo, "main"],
        [tree, "tree"],
      ] as const) {
        mkdirSync(join(checkout, ".agents/store/plans"), { recursive: true });
        writeFileSync(join(checkout, ".agents/store/plans/plan.md"), `${text}\n`);
      }
      const states = (await Promise.all([ensureAsync(repo, stores), ensureAsync(tree, stores)]))
        .map((made) => made.state)
        .sort();
      // One folder moves in; the other clashes on the same name and keeps its file.
      expect(states).toEqual(["adopted", "conflict"]);
      const kept = [join(stores, legacyId(repo)), repo, tree]
        .map((root) =>
          join(root, ".agents/store/plans/plan.md").replace(
            `${join(stores, legacyId(repo))}/.agents/store`,
            join(stores, legacyId(repo)),
          ),
        )
        .filter((file) => existsSync(file))
        .map((file) => readFileSync(file, "utf8"))
        .sort();
      expect(kept).toContain("main\n");
      expect(kept).toContain("tree\n");
    }
  });

  it("makes one link when sessions start at once in one checkout", async () => {
    for (let round = 0; round < 5; round++) {
      const { repo, stores } = world();
      const runs = await Promise.all([1, 2, 3].map(() => ensureAsync(repo, stores)));
      expect(runs.map((made) => made.state).sort()).toEqual(["linked", "ok", "ok"]);
      const store = join(stores, legacyId(repo));
      // No link inside the store back to itself.
      expect(existsSync(join(store, legacyId(repo)))).toBe(false);
    }
  });

  it("leaves a tracked folder, a foreign link and a file alone", () => {
    const tracked = world();
    mkdirSync(join(tracked.repo, ".agents/store"), { recursive: true });
    writeFileSync(join(tracked.repo, ".agents/store/kept.md"), "kept\n");
    git(tracked.repo, "add", ".agents/store/kept.md");
    expect(ensure(tracked.repo, tracked.stores).state).toBe("tracked");
    expect(lstatSync(join(tracked.repo, ".agents/store")).isDirectory()).toBe(true);
    expect(
      existsSync(join(tracked.repo, ".git/info/exclude"))
        ? readFileSync(join(tracked.repo, ".git/info/exclude"), "utf8")
        : "",
    ).not.toContain("/.agents/store");

    const foreign = world();
    mkdirSync(join(foreign.repo, ".agents"));
    symlinkSync(foreign.base, join(foreign.repo, ".agents/store"));
    const linked = ensure(foreign.repo, foreign.stores);
    expect(linked).toMatchObject({ state: "foreign", detail: foreign.base });
    expect(readlinkSync(join(foreign.repo, ".agents/store"))).toBe(foreign.base);

    const file = world();
    mkdirSync(join(file.repo, ".agents"));
    writeFileSync(join(file.repo, ".agents/store"), "not a folder\n");
    const blocked = ensure(file.repo, file.stores);
    expect(blocked.state).toBe("file");
    expect(hasStore(blocked)).toBe(false);
  });

  it("has no store outside git", () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "notes-nogit-")));
    const made = ensure(base, join(base, "stores"));
    expect(made.state).toBe("not-git");
    expect(existsSync(join(base, ".agents"))).toBe(false);
    expect(existsSync(join(base, "stores"))).toBe(false);
    expect(noticeOf(made)).toBeUndefined();
  });
});

describe("readEnsure", () => {
  it("counts a run that printed no state as failed", () => {
    expect(readEnsure("").state).toBe("failed");
    expect(readEnsure("state\tnonsense\n").state).toBe("failed");
  });
});
