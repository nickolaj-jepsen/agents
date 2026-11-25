import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodeHost } from "../pi/host.ts";
import {
  ensureAt,
  handNote,
  loadGroups,
  memoryDirOf,
  placeOf,
  readBody,
  shelfOf,
} from "./gather.ts";
import { notesOf, type Note } from "./shelf.ts";

const base = () => realpathSync(mkdtempSync(join(tmpdir(), "notes-gather-")));

/** A world: a repository, the folder every store is in, and a host that sees only them. */
function world() {
  const root = base();
  const env = {
    ...process.env,
    PATH: `${join(root, "bin")}:${process.env.PATH ?? ""}`,
    XDG_CONFIG_HOME: join(root, "config"),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const repo = join(root, "repo");
  mkdirSync(join(root, "bin"));
  mkdirSync(repo);
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { env });
  git("init", "-q", "-b", "main");
  git(
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
  return { root, repo, stores: join(root, "stores"), host: nodeHost(env), git };
}

const write = (file: string, text: string) => {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text);
};

describe("linking and walking", () => {
  it("links a checkout, and walks the store it lands in", async () => {
    const w = world();
    const ensured = await ensureAt(w.host, w.repo, w.stores);
    expect(ensured.state).toBe("linked");
    expect(placeOf(ensured)).toBe("store");
    write(join(w.repo, ".agents/store/plans/retry.md"), "# Retry\n");
    write(join(w.repo, ".agents/store/plans/shot.png"), "png");
    write(join(w.repo, ".agents/store/README.md"), "# Read me\n");
    // The folder written to last comes first.
    utimesSync(join(w.repo, ".agents/store/README.md"), 1, 1);
    expect(await shelfOf(w.host, ensured)).toBe(ensured.store);
    const groups = await loadGroups(w.host, ensured);
    expect(groups.map((g) => [g.label, g.notes.length, g.artefacts])).toEqual([
      ["plans", 1, 1],
      ["store", 1, 0],
    ]);
    expect(groups[0]?.notes[0]?.file).toBe(join(ensured.store ?? "", "plans/retry.md"));
  });

  it("walks the checkout's own folder where git tracks it, and nothing outside git", async () => {
    const w = world();
    write(join(w.repo, ".agents/store/kept.md"), "kept\n");
    w.git("add", ".agents/store/kept.md");
    const ensured = await ensureAt(w.host, w.repo, w.stores);
    expect(ensured.state).toBe("tracked");
    expect(await shelfOf(w.host, ensured)).toBe(join(w.repo, ".agents/store"));
    expect(notesOf(await loadGroups(w.host, ensured)).map((n) => n.name)).toEqual(["kept.md"]);

    const outside = await ensureAt(w.host, base(), w.stores);
    expect(placeOf(outside)).toBe("outside");
    expect(await loadGroups(w.host, outside)).toEqual([]);
  });

  it("counts a run that never started as failed, and a home it cannot find", async () => {
    const w = world();
    const host = { ...w.host, run: async () => undefined };
    expect(await ensureAt(host, w.repo, w.stores)).toMatchObject({ state: "failed" });
    expect(placeOf(await ensureAt(w.host, w.repo, undefined))).toBe("none");
  });

  it("adds the harness's memory last, when it saved some", async () => {
    const w = world();
    const ensured = await ensureAt(w.host, w.repo, w.stores);
    write(join(w.repo, ".agents/store/plans/a.md"), "a\n");
    const memory = join(w.root, "memory");
    write(join(memory, "MEMORY.md"), "- one\n");
    write(join(memory, "index.json"), "{}");
    const groups = await loadGroups(w.host, ensured, memory);
    expect(groups.map((g) => g.label)).toEqual(["plans", "memory"]);
    expect((await loadGroups(w.host, ensured, join(w.root, "none"))).map((g) => g.label)).toEqual([
      "plans",
    ]);
  });
});

describe("memoryDirOf", () => {
  it("takes the setting, a home in it expanded, else the folder named after the main checkout", () => {
    const o = { configDir: undefined, home: "/h", main: "/h/dev/my.repo" };
    expect(memoryDirOf({ ...o, setting: "/m/x" })).toBe("/m/x");
    expect(memoryDirOf({ ...o, setting: "~/m" })).toBe("/h/m");
    expect(memoryDirOf({ ...o, setting: "" })).toBe("/h/.claude/projects/-h-dev-my-repo/memory");
    expect(memoryDirOf({ ...o, setting: undefined, configDir: "/c" })).toBe(
      "/c/projects/-h-dev-my-repo/memory",
    );
    expect(memoryDirOf({ ...o, setting: undefined, main: undefined })).toBeUndefined();
  });
});

describe("reading a note", () => {
  it("reads its text, or says why it does not", async () => {
    const w = world();
    const small = join(w.root, "small.md");
    write(small, "# Small\n");
    expect(await readBody(w.host, note(small))).toEqual({ text: "# Small\n" });
    const big = join(w.root, "big.md");
    write(big, "x".repeat(300 * 1024));
    expect(await readBody(w.host, note(big))).toEqual({
      problem: "This note is 300 KiB, too large to read here. Open hands it to an app.",
    });
    expect(await readBody(w.host, note(join(w.root, "gone.md")))).toEqual({
      problem: "This note is no longer in the store.",
    });
  });
});

describe("handing a note to an app", () => {
  /** A stand-in for `name` that writes its arguments to `launched.log` and exits. */
  const stub = (w: ReturnType<typeof world>, name: string) => {
    const file = join(w.root, "bin", name);
    writeFileSync(file, `#!/bin/sh\necho "${name} $*" >> "${join(w.root, "launched.log")}"\n`);
    chmodSync(file, 0o755);
  };
  const launched = async (w: ReturnType<typeof world>) => {
    const log = join(w.root, "launched.log");
    for (let i = 0; i < 50 && !existsSync(log); i++) await new Promise((r) => setTimeout(r, 20));
    return existsSync(log) ? readFileSync(log, "utf8") : "";
  };

  it("starts the first app open.json and the built-in table give, detached", async () => {
    const w = world();
    stub(w, "my-editor");
    write(
      join(w.root, "config/agents/open.json"),
      JSON.stringify({
        apps: [{ id: "mine", label: "Mine", command: "my-editor", file: ["{file}"] }],
      }),
    );
    const file = join(w.root, "a note.md");
    expect(await handNote(w.host, note(file), "app")).toEqual({ app: "Mine" });
    expect(await launched(w)).toBe(`my-editor ${file}\n`);
  });

  it("gives an HTML note to the browser as a file link", async () => {
    const w = world();
    stub(w, "xdg-open");
    // Whatever editors the machine has, the browser is the only built-in app that takes a link.
    expect(await handNote(w.host, note(join(w.root, "r.html")), "browser")).toEqual({
      app: "Browser",
    });
    expect(await launched(w)).toBe(`xdg-open file://${join(w.root, "r.html")}\n`);
  });

  it("says so when no app takes it", async () => {
    const w = world();
    write(
      join(w.root, "config/agents/open.json"),
      JSON.stringify({ apps: ["code", "zed"].map((id) => ({ id, hidden: true })) }),
    );
    expect(await handNote(w.host, note(join(w.root, "a.md")), "app")).toEqual({
      problem: "No app that opens a file is installed. Add one to ~/.config/agents/open.json.",
    });
  });
});

function note(file: string): Note {
  return { id: "x", name: "x", file, kind: "markdown", at: 0 };
}
