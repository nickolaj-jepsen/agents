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
  BACKOFF_MS,
  createLinks,
  ensureAt,
  ENSURE_TIMEOUT_MS,
  handNote,
  linkNotice,
  loadGroups,
  memoryDirOf,
  noticeText,
  placeOf,
  readBody,
  shelfOf,
} from "./gather.ts";
import { notesOf, projectKey, type Note } from "./shelf.ts";
import type { Ensured } from "./store.ts";

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

  it("counts a relative path or a bare ~ as unset, as Claude Code does", () => {
    const o = { configDir: undefined, home: "/h", main: "/h/dev/my.repo" };
    const dflt = "/h/.claude/projects/-h-dev-my-repo/memory";
    for (const setting of ["~", "notes/memory", "./m", "~me/m", "  "])
      expect(memoryDirOf({ ...o, setting })).toBe(dflt);
    expect(memoryDirOf({ ...o, setting: "~/x" })).toBe("/h/x");
    expect(memoryDirOf({ ...o, setting: 5 })).toBe(dflt);
  });

  it("names a long main checkout as Claude Code does", () => {
    const main = `/h/${"projects/".repeat(30)}repo`;
    const path = memoryDirOf({ setting: undefined, configDir: "/c", home: "/h", main });
    expect(path).toBe(`/c/projects/${projectKey(main)}/memory`);
    expect(path?.split("/")[3]).toMatch(/^.{200}-[0-9a-z]+$/);
  });
});

describe("control characters", () => {
  it("never reach the reader: a note's text and a read error are cleaned", async () => {
    const w = world();
    const file = join(w.root, "evil.md");
    write(file, "a \u001b]52;c;eA==\u0007 b\r\nc\fd\n");
    expect(await readBody(w.host, note(file))).toEqual({
      text: "a �]52;c;eA==� b\nc�d\n",
    });
    const host = {
      ...w.host,
      size: async () => 10,
      read: async () => {
        throw new Error("no \u001b[2J here");
      },
    };
    expect(await readBody(host, note(file))).toEqual({
      problem: "Couldn't read this note: no �[2J here",
    });
  });

  it("are gone from a link's notice, which names paths", () => {
    const text = noticeText({ state: "foreign", detail: "/x/\u001b]0;t\u0007y" });
    expect(text).toBe(
      ".agents/store links to /x/�]0;t�y, not to this repository's store. Left alone.",
    );
    expect(linkNotice({ state: "failed", detail: "cannot write /a\u001bb" })).not.toMatch(/\u001b/);
  });
});

describe("the link's back-off", () => {
  const failed: Ensured = { state: "failed", detail: "cannot link" };
  const linked: Ensured = { state: "linked", root: "/r" };

  /** A clock that moves when told, and an `ensure` that answers from a list and counts. */
  function rig(answers: Ensured[], delay = 0) {
    let now = 1_000_000;
    let runs = 0;
    const shared = createLinks();
    const ensure = async () => {
      const answer = answers[Math.min(runs, answers.length - 1)] as Ensured;
      runs++;
      now += delay;
      return answer;
    };
    const links = {
      get: (cwd: string, o: { fresh?: boolean } = {}) =>
        shared.get(cwd, { ensure, clock: () => now, ...o }),
    };
    return { links, runs: () => runs, pass: (ms: number) => void (now += ms) };
  }

  it("runs a link that is there once, however often it is asked", async () => {
    const r = rig([linked]);
    for (let i = 0; i < 5; i++) expect(await r.links.get("/r")).toBe(linked);
    r.pass(10 * 60_000);
    await r.links.get("/r");
    expect(r.runs()).toBe(1);
  });

  it("leaves a failed, busy or timed-out folder alone for 30 s, then asks again", async () => {
    for (const state of [{ state: "busy" } as Ensured, failed]) {
      const r = rig([state, linked]);
      expect((await r.links.get("/r")).state).toBe(state.state);
      for (let i = 0; i < 4; i++) expect((await r.links.get("/r")).state).toBe(state.state);
      expect(r.runs()).toBe(1);
      r.pass(BACKOFF_MS - 1);
      expect((await r.links.get("/r")).state).toBe(state.state);
      expect(r.runs()).toBe(1);
      r.pass(1);
      expect((await r.links.get("/r")).state).toBe("linked");
      expect(r.runs()).toBe(2);
    }
  });

  it("counts the back-off from when the run ended, not when it began", async () => {
    const r = rig([failed, linked], 10_000);
    await r.links.get("/r");
    r.pass(BACKOFF_MS - 1);
    expect((await r.links.get("/r")).state).toBe("failed");
    expect(r.runs()).toBe(1);
  });

  it("runs a script that threw as a failed link", async () => {
    let now = 0;
    const shared = createLinks();
    const links = {
      get: (cwd: string) =>
        shared.get(cwd, { ensure: () => Promise.reject(new Error("x")), clock: () => now }),
    };
    expect((await links.get("/r")).state).toBe("failed");
    await links.get("/r");
    now += BACKOFF_MS;
    expect((await links.get("/r")).state).toBe("failed");
  });

  it("asks at once when the person opens /notes, and keeps the answer", async () => {
    const r = rig([failed, linked]);
    await r.links.get("/r");
    expect((await r.links.get("/r", { fresh: true })).state).toBe("linked");
    expect((await r.links.get("/r")).state).toBe("linked");
    expect(r.runs()).toBe(2);
  });

  it("keeps a folder's back-off apart from another's, and runs two asks together once", async () => {
    const r = rig([failed, linked]);
    const [a, b] = await Promise.all([r.links.get("/a"), r.links.get("/a")]);
    expect(a).toBe(b);
    expect(r.runs()).toBe(1);
    expect((await r.links.get("/b")).state).toBe("linked");
    expect(r.runs()).toBe(2);
  });

  it("hears busy, and says why, from a store another session holds, inside the run's time", async () => {
    const w = world();
    const first = await ensureAt(w.host, w.repo, w.stores);
    mkdirSync(join(w.stores, `.${first.id}.lock`));
    const started = Date.now();
    const held = await ensureAt(w.host, w.repo, w.stores);
    expect(held.state).toBe("busy");
    // The script waits about four seconds on a lock; the run is given well over that.
    expect(Date.now() - started).toBeLessThan(ENSURE_TIMEOUT_MS - 2000);
    expect(linkNotice(held)).toMatch(/^Another session is setting up this repository's store/);
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
