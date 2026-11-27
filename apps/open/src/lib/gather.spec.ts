import { describe, expect, test } from "vitest";
import { probeArgv, readConfig } from "@agents/launch/apps.ts";
import {
  browse,
  buildFolder,
  openArgumentCompletions,
  PLAN_ARG,
  planRequested,
  buildGit,
  buildMenu,
  COMMANDS,
  focusOf,
  GH_TIMEOUT_MS,
  GIT_TIMEOUT_MS,
  menuText,
  pressRow,
  problemsText,
  type PressHost,
  type Ran,
} from "./gather.ts";
import type { Menu, Row } from "./menus.ts";

const CWD = "/repo";
const PR =
  '{"url":"https://github.com/me/repo/pull/12","number":12,"state":"OPEN","isDraft":false}';
const STATUS = "# branch.oid abc1234def\n# branch.head feat/x\n# branch.upstream origin/feat/x\n";

type Call = { argv: string[]; timeoutMs: number; cwd?: string };

type Machine = {
  /** What git answers, by the arguments after `-C <cwd>`; a missing one fails. */
  git?: Record<string, string>;
  /** `gh pr view`: its result, or nothing when gh is not there. */
  gh?: Ran | undefined;
  /** The executables the probe finds, as `<name>` → `/usr/bin/<name>`. */
  installed?: string[];
  config?: string;
  platform?: "mac" | "linux";
  copy?: Awaited<ReturnType<PressHost["copy"]>>;
  starts?: boolean;
  /** What the host owns of another plugin's commands; absent means a host that cannot run one. */
  owns?: string[];
  /** What `xdg-terminal-exec --print-id` exits with; none for a program that cannot run. */
  printId?: number;
};

const ok = (stdout: string): Ran => ({ exitCode: 0, stdout, stderr: "" });
const fail = (stderr = ""): Ran => ({ exitCode: 1, stdout: "", stderr });

/** A host that answers from `m` and remembers every call and every word it was asked to say. */
function fakeHost(m: Machine = {}) {
  const calls: Call[] = [];
  const reported: string[][] = [];
  const said: [string, string][] = [];
  const copied: string[] = [];
  const started: { argv: string[]; cwd?: string }[] = [];
  const gitAnswers: Record<string, string> = {
    "status --porcelain=v2 --branch --untracked-files=no": STATUS,
    "config --get-regexp ^remote\\..*\\.url$": "remote.origin.url git@github.com:me/repo.git\n",
    "config --get branch.feat/x.remote": "origin\n",
    "symbolic-ref --quiet --short refs/remotes/origin/HEAD": "origin/main\n",
    ...m.git,
  };
  const host: PressHost = {
    async run(argv, timeoutMs, cwd) {
      calls.push({ argv, timeoutMs, ...(cwd ? { cwd } : {}) });
      if (argv[0] === "git") {
        const answer = gitAnswers[argv.slice(4).join(" ")];
        return answer === undefined ? fail() : ok(answer);
      }
      if (argv[0] === "gh") return "gh" in m ? m.gh : ok(PR);
      if (argv[0] === "sh") {
        const names = argv.slice(4, argv.indexOf("--"));
        const found = names.filter((n) => (m.installed ?? ["code", "xdg-open"]).includes(n));
        return ok(found.map((n) => `c\t${n}\t/usr/bin/${n}\n`).join(""));
      }
      if (argv[1] === "--print-id") {
        return "printId" in m && m.printId !== undefined
          ? { exitCode: m.printId, stdout: "", stderr: "" }
          : ok("id");
      }
      return undefined;
    },
    config: async () => ({ text: m.config, platform: m.platform ?? "linux" }),
    report: (problems) => void reported.push([...problems]),
    async copy(text) {
      copied.push(text);
      return m.copy ?? { isCopied: true };
    },
    async start(argv, cwd) {
      started.push({ argv, ...(cwd ? { cwd } : {}) });
      return m.starts ?? true;
    },
    say: (text, tone) => void said.push([text, tone]),
    ...("owns" in m ? { runCommand: (command: string) => (m.owns ?? []).includes(command) } : {}),
  };
  return { host, calls, reported, said, copied, started };
}

const ids = (menu: Menu) => menu.rows?.map((r) => r.id);
const row = (menu: Menu, id: string) => menu.rows?.find((r) => r.id === id) as Row;

describe("buildGit", () => {
  test("asks git and gh what the mod asks, with the same arguments and timeouts", async () => {
    const { host, calls } = fakeHost();
    await buildGit(host, CWD);
    const git = (...args: string[]) => ({
      argv: ["git", "--no-optional-locks", "-C", CWD, ...args],
      timeoutMs: GIT_TIMEOUT_MS,
    });
    expect(calls).toEqual(
      expect.arrayContaining([
        git("status", "--porcelain=v2", "--branch", "--untracked-files=no"),
        git("config", "--get-regexp", "^remote\\..*\\.url$"),
        git("config", "--get", "branch.feat/x.remote"),
        git("config", "--get", "branch.feat/x.gh-merge-base"),
        {
          argv: ["gh", "pr", "view", "--json", "url,number,state,isDraft"],
          timeoutMs: GH_TIMEOUT_MS,
          cwd: CWD,
        },
        { argv: probeArgv(readConfig(undefined, "linux").apps), timeoutMs: GIT_TIMEOUT_MS },
        git("symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"),
      ]),
    );
    expect(calls).toHaveLength(7);
    // Status first: nothing else is asked of a folder that is no repository.
    expect(calls[0]).toEqual(git("status", "--porcelain=v2", "--branch", "--untracked-files=no"));
  });

  test("a pushed branch with a pull request: the pull request is preselected", async () => {
    const menu = await buildGit(fakeHost().host, CWD);
    expect(menu.context).toBe("me/repo");
    expect(ids(menu)).toEqual(["repo", "branch", "pr", "create", "copy", "copy-pr"]);
    expect(menu.preferred).toBe("pr");
    expect(row(menu, "create").unavailable).toBe("PR #12 is open");
  });

  test("no pull request: create links the compare page into the remote's default branch", async () => {
    const { host } = fakeHost({
      gh: fail("no pull requests found for branch"),
      git: { "symbolic-ref --quiet --short refs/remotes/origin/HEAD": "origin/trunk\n" },
    });
    const menu = await buildGit(host, CWD);
    expect(row(menu, "create").action).toEqual({
      kind: "url",
      url: "https://github.com/me/repo/compare/trunk...feat/x?expand=1",
    });
    expect(row(menu, "create").description).toBe("into trunk");
  });

  test("the branch's gh-merge-base wins, and no default branch is asked for", async () => {
    const { host, calls } = fakeHost({
      gh: fail("no pull requests found for branch"),
      git: { "config --get branch.feat/x.gh-merge-base": "release/1\n" },
    });
    const menu = await buildGit(host, CWD);
    expect(row(menu, "create").description).toBe("into release/1");
    expect(calls.some((c) => c.argv.includes("symbolic-ref"))).toBe(false);
  });

  test("without a remote HEAD, a local main or master ref, else main", async () => {
    const pr = { gh: fail("no pull requests found for branch") };
    const master = fakeHost({
      ...pr,
      git: {
        "symbolic-ref --quiet --short refs/remotes/origin/HEAD": "",
        "rev-parse --verify --quiet refs/remotes/origin/master": "abc\n",
      },
    });
    expect(row(await buildGit(master.host, CWD), "create").description).toBe("into master");
    const none = fakeHost({
      ...pr,
      git: { "symbolic-ref --quiet --short refs/remotes/origin/HEAD": "" },
    });
    expect(row(await buildGit(none.host, CWD), "create").description).toBe("into main");
  });

  test("gh's answers: none, not installed, could not say", async () => {
    const create = async (gh: Ran | undefined) =>
      row(await buildGit(fakeHost({ gh }).host, CWD), "create");
    expect((await create(fail("no git remotes found"))).action?.kind).toBe("url");
    expect((await create(undefined)).unavailable).toBe("gh not installed");
    expect((await create(fail("HTTP 401: Bad credentials"))).unavailable).toBe("gh could not say");
    expect((await create(ok("not json"))).unavailable).toBe("gh could not say");
  });

  test("a branch never pushed asks gh nothing", async () => {
    const { host, calls } = fakeHost({
      git: {
        "status --porcelain=v2 --branch --untracked-files=no":
          "# branch.oid abc1234def\n# branch.head feat/x\n",
      },
    });
    const menu = await buildGit(host, CWD);
    expect(calls.some((c) => c.argv[0] === "gh")).toBe(false);
    expect(row(menu, "create").unavailable).toBe("push the branch first");
  });

  test("not a repository: the menu says so and nothing else is asked", async () => {
    const { host, calls } = fakeHost({
      git: { "status --porcelain=v2 --branch --untracked-files=no": "" },
    });
    expect(await buildGit(host, CWD)).toEqual({
      kind: "git",
      title: "Git",
      rows: [],
      error: "Not a git repository.",
    });
    expect(calls).toHaveLength(1);
  });

  test("open.json's problems and a forge that is none of the three are reported once", async () => {
    const { host, reported } = fakeHost({
      config: JSON.stringify({ apps: [{ label: "x" }], forges: { "git.example.com": "gitea" } }),
    });
    await buildGit(host, CWD);
    expect(reported).toHaveLength(1);
    expect(reported[0]).toEqual([
      'apps[0] has no "id"; left out',
      'forges.git.example.com: "gitea" is not github, gitlab or codeberg; left out',
    ]);
  });

  test("a clean open.json reports nothing", async () => {
    const { host, reported } = fakeHost({ config: "{}" });
    await buildGit(host, CWD);
    expect(reported).toEqual([]);
  });
});

describe("buildFolder", () => {
  test("the apps in their order, a missing one in its place, Copy path last", async () => {
    const { host, reported } = fakeHost({ installed: ["code", "nautilus", "xdg-open"] });
    const menu = await buildFolder(host, CWD);
    expect(ids(menu)).toEqual(["code", "zed", "smerge", "files", "terminal", "copy"]);
    expect(row(menu, "zed").unavailable).toBe("not installed");
    expect(row(menu, "code").action).toEqual({
      kind: "launch",
      argv: ["/usr/bin/code", CWD],
      cwd: CWD,
    });
    expect(menu.preferred).toBe("code");
    expect(reported).toEqual([]);
  });

  test("a launcher with no terminal chosen is not set up, and the readiness is asked with a timeout", async () => {
    const { host, calls } = fakeHost({
      installed: ["code", "xdg-open", "xdg-terminal-exec"],
      printId: 1,
    });
    const menu = await buildFolder(host, CWD);
    expect(row(menu, "terminal").unavailable).toBe("not set up");
    expect(row(menu, "terminal").action).toBeUndefined();
    const asked = calls.find((c) => c.argv[1] === "--print-id");
    expect(asked?.argv).toEqual(["/usr/bin/xdg-terminal-exec", "--print-id"]);
    expect(asked?.timeoutMs).toBeLessThan(GIT_TIMEOUT_MS);
  });

  test("a launcher that has a terminal chosen is a row to press", async () => {
    const menu = await buildFolder(
      fakeHost({ installed: ["code", "xdg-open", "xdg-terminal-exec"] }).host,
      CWD,
    );
    expect(row(menu, "terminal").action?.kind).toBe("launch");
  });

  test("an app of open.json that says it is not set up is no row to press", async () => {
    const { host } = fakeHost({
      installed: ["my-editor", "code"],
      printId: 1,
      config: JSON.stringify({
        apps: [
          {
            id: "mine",
            label: "Mine",
            command: "my-editor",
            dir: ["{dir}"],
            ready: ["--print-id"],
          },
        ],
      }),
    });
    const menu = await buildFolder(host, CWD);
    expect(row(menu, "mine").unavailable).toBe("not set up");
    // The row keeps its place, and the keyboard starts on the first app that can run.
    expect(ids(menu)?.[0]).toBe("mine");
    expect(menu.preferred).toBe("code");
  });

  test("a program of open.json that runs in a terminal is left without one", async () => {
    const { host } = fakeHost({
      installed: ["xdg-terminal-exec", "nvim"],
      printId: 1,
      config: JSON.stringify({
        apps: [{ id: "nvim", command: "nvim", dir: ["{dir}"], terminal: true }],
      }),
    });
    const menu = await buildFolder(host, CWD);
    expect(row(menu, "nvim").unavailable).toBe("no terminal to run it in");
    expect(row(menu, "terminal").unavailable).toBe("not set up");
  });

  test("macOS's apps come from the platform the host names", async () => {
    const menu = await buildFolder(fakeHost({ platform: "mac", installed: ["open"] }).host, CWD);
    expect(row(menu, "files").label).toBe("Finder");
  });

  test("a broken open.json is reported, and the built-in apps stay", async () => {
    const { host, reported } = fakeHost({ config: "{ not json" });
    const menu = await buildMenu(host, "folder", CWD);
    expect(reported).toHaveLength(1);
    expect(reported[0]?.[0]).toMatch(/^open\.json is not JSON/);
    expect(ids(menu)).toContain("code");
  });
});

describe("browse", () => {
  test("the first installed app that takes a link", async () => {
    const { host } = fakeHost({ installed: ["xdg-open"] });
    expect(await browse(host, "https://x.test")).toEqual(["/usr/bin/xdg-open", "https://x.test"]);
    expect(await browse(fakeHost({ installed: [] }).host, "https://x.test")).toBeUndefined();
  });
});

describe("pressRow", () => {
  const link: Row = {
    id: "pr",
    label: "Open pull request #12",
    action: { kind: "url", url: "https://x.test/pull/12" },
  };

  test("a row that cannot run says why and the menu stays", async () => {
    const { host, said, started } = fakeHost();
    const unavailable = { id: "smerge", label: "Sublime Merge", unavailable: "not installed" };
    expect(await pressRow(host, unavailable)).toBe("stay");
    expect(said).toEqual([["Sublime Merge: not installed", "info"]]);
    expect(started).toEqual([]);
  });

  test("a link starts the browser, in no folder of its own, and the menu closes", async () => {
    const { host, said, started } = fakeHost();
    expect(await pressRow(host, link)).toBe("close");
    expect(started).toEqual([{ argv: ["/usr/bin/xdg-open", "https://x.test/pull/12"] }]);
    expect(said).toEqual([]);
  });

  test("a link with no browser says so and the menu stays", async () => {
    const { host, said, started } = fakeHost({ installed: ["code"] });
    expect(await pressRow(host, link)).toBe("stay");
    expect(said).toEqual([["No browser app is installed to open the link", "warning"]]);
    expect(started).toEqual([]);
  });

  test("an app starts in the row's folder; one that would not start is said, and it closes", async () => {
    const app: Row = {
      id: "code",
      label: "VS Code",
      action: { kind: "launch", argv: ["/usr/bin/code", CWD], cwd: CWD },
    };
    const { host, said, started } = fakeHost({ starts: false });
    expect(await pressRow(host, app)).toBe("close");
    expect(started).toEqual([{ argv: ["/usr/bin/code", CWD], cwd: CWD }]);
    expect(said).toEqual([["Couldn't start /usr/bin/code", "warning"]]);
  });

  test("a copy says what it copied, or why it could not, and closes either way", async () => {
    const copy: Row = {
      id: "copy",
      label: "Copy branch name",
      action: { kind: "copy", text: "feat/x", what: "branch name" },
    };
    const done = fakeHost();
    expect(await pressRow(done.host, copy)).toBe("close");
    expect(done.copied).toEqual(["feat/x"]);
    expect(done.said).toEqual([["Copied the branch name", "info"]]);
    const refused = fakeHost({ copy: { isCopied: false, reason: "no clipboard" } });
    expect(await pressRow(refused.host, copy)).toBe("close");
    expect(refused.said).toEqual([["Couldn't copy: no clipboard", "warning"]]);
  });
});

describe("words", () => {
  test("problemsText: the first problem and how many more", () => {
    expect(problemsText([])).toBeUndefined();
    expect(problemsText(["a"])).toBe("open.json: a");
    expect(problemsText(["a", "b", "c"])).toBe("open.json: a (and 2 more)");
  });

  test("focusOf: where the keyboard was moved, else the menu's pick, else the first", () => {
    const menu: Menu = {
      kind: "git",
      title: "Git",
      rows: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      preferred: "b",
    };
    expect(focusOf(menu, "a")).toBe("a");
    expect(focusOf(menu, "gone")).toBe("b");
    expect(focusOf({ ...menu, preferred: undefined }, null)).toBe("a");
    expect(focusOf(null, null)).toBeUndefined();
  });

  test("menuText: a numbered row each, with its note and what a press does or why it can't", async () => {
    const menu = await buildGit(fakeHost().host, CWD);
    expect(menuText(menu)).toBe(
      [
        "Git: me/repo",
        "1. Open repository (github.com): https://github.com/me/repo",
        "2. Open branch: https://github.com/me/repo/tree/feat/x",
        "3. Open pull request #12 (open): https://github.com/me/repo/pull/12",
        "4. Create pull request: unavailable, PR #12 is open",
        "5. Copy branch name: feat/x",
        "6. Copy PR URL: https://github.com/me/repo/pull/12",
      ].join("\n"),
    );
    expect(menuText({ kind: "git", title: "Git", rows: [], error: "Not a git repository." })).toBe(
      "Git\nNot a git repository.",
    );
  });

  test("the two commands open the two menus", () => {
    expect(COMMANDS.map((c) => [c.name, c.kind])).toEqual([
      ["git", "git"],
      ["open", "folder"],
    ]);
  });
});

describe("a row that names another plugin's command", () => {
  const notes: Row = { id: "notes", label: "Notes", action: { kind: "command", command: "notes" } };

  test("closes the menu when a plugin owns the command, and runs nothing itself", async () => {
    const { host, said, started, copied } = fakeHost({ owns: ["notes"] });
    expect(await pressRow(host, notes)).toBe("close");
    expect(said).toEqual([]);
    expect(started).toEqual([]);
    expect(copied).toEqual([]);
  });

  test("says which command has no owner and keeps the menu, so the row is not a dead press", async () => {
    const { host, said } = fakeHost({ owns: [] });
    expect(await pressRow(host, notes)).toBe("stay");
    expect(said).toEqual([["No /notes plugin is installed", "warning"]]);
  });

  test("is unavailable on a host that cannot run another plugin's command", async () => {
    const { host, said } = fakeHost();
    expect(await pressRow(host, notes)).toBe("stay");
    expect(said).toEqual([["No /notes plugin is installed", "warning"]]);
  });

  test("reads in the text menu as the command it runs", () => {
    expect(menuText({ kind: "folder", title: "Open folder", rows: [notes] })).toBe(
      "Open folder\n1. Notes: runs /notes",
    );
  });
});

describe("/open plan", () => {
  test("is the notes, as it was before /open had a menu", () => {
    expect(planRequested(" plan ")).toBe(true);
    expect(planRequested("plan")).toBe(true);
    expect(planRequested("")).toBe(false);
    expect(planRequested("plans")).toBe(false);
  });

  test("is offered while it is typed, and nothing else is", () => {
    expect(openArgumentCompletions("pl")).toEqual([
      { value: PLAN_ARG, label: PLAN_ARG, description: "this checkout's notes" },
    ]);
    expect(openArgumentCompletions("")).toHaveLength(1);
    expect(openArgumentCompletions("gi")).toBeNull();
  });
});
