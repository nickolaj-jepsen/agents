import { describe, expect, it } from "vitest";
import { builtinApps, choices, type Installed } from "@agents/launch/apps.ts";
import {
  chooseRemote,
  folderMenu,
  forgesOf,
  gitMenu,
  parseRemote,
  type Forges,
  type Menu,
  type Pr,
  type Remote,
  type Row,
  type Status,
} from "./menus.ts";

const GITHUB: Remote = {
  name: "origin",
  forge: "github",
  host: "github.com",
  owner: "me",
  repo: "repo",
  web: "https://github.com/me/repo",
};
const PUSHED: Status = { branch: "feat/x", oid: "abc1234def5678", upstream: true };
const OPEN: Pr = { url: "https://github.com/me/repo/pull/12", number: 12, state: "open" };

const ids = (menu: Menu) => menu.rows?.map((r) => r.id);
const row = (menu: Menu, id: string): Row | undefined => menu.rows?.find((r) => r.id === id);

describe("forgesOf", () => {
  it("keeps the three public forges with nothing named", () => {
    expect(forgesOf({})).toEqual({
      forges: { "github.com": "github", "gitlab.com": "gitlab", "codeberg.org": "codeberg" },
      problems: [],
    });
  });

  it("adds a named host", () => {
    const { forges, problems } = forgesOf({ "git.example.com": "gitlab" });
    expect(forges["git.example.com"]).toBe("gitlab");
    expect(forges["github.com"]).toBe("github");
    expect(problems).toEqual([]);
  });

  it("leaves out a forge that is none of the three, and says which", () => {
    const { forges, problems } = forgesOf({ "git.example.com": "gitea", "git.corp": "github" });
    expect(forges["git.example.com"]).toBeUndefined();
    expect(forges["git.corp"]).toBe("github");
    expect(problems).toEqual([
      'forges.git.example.com: "gitea" is not github, gitlab or codeberg; left out',
    ]);
  });

  it("lets a named host override a public one", () => {
    expect(forgesOf({ "github.com": "codeberg" }).forges["github.com"]).toBe("codeberg");
  });
});

describe("parseRemote", () => {
  const custom: Forges = {
    "github.com": "github",
    "git.example.com": "gitlab",
    "code.corp": "codeberg",
  };

  it("reads the scp-like and URL forms of a public forge", () => {
    expect(parseRemote("origin", "git@github.com:me/repo.git")).toMatchObject({
      forge: "github",
      owner: "me",
      repo: "repo",
      web: "https://github.com/me/repo",
    });
    expect(parseRemote("origin", "https://gitlab.com/a/b/c.git/")).toMatchObject({
      forge: "gitlab",
      owner: "a/b",
      repo: "c",
      web: "https://gitlab.com/a/b/c",
    });
    expect(parseRemote("origin", "ssh://git@codeberg.org/me/repo")).toMatchObject({
      forge: "codeberg",
    });
  });

  it("does not guess a self-hosted host", () => {
    expect(parseRemote("origin", "git@git.example.com:team/repo.git")).toBeUndefined();
  });

  it("links a self-hosted host a map names, with nested groups", () => {
    expect(parseRemote("origin", "git@git.example.com:team/sub/repo.git", custom)).toEqual({
      name: "origin",
      forge: "gitlab",
      host: "git.example.com",
      owner: "team/sub",
      repo: "repo",
      web: "https://git.example.com/team/sub/repo",
    });
    expect(parseRemote("up", "https://CODE.corp/me/repo.git", custom)).toMatchObject({
      forge: "codeberg",
      host: "code.corp",
      web: "https://code.corp/me/repo",
    });
  });

  it("takes a map's word over the public hosts it replaces, not over the rest", () => {
    expect(parseRemote("origin", "git@gitlab.com:a/b.git", custom)).toBeUndefined();
  });

  it("refuses a path with no owner, and what is no remote", () => {
    expect(parseRemote("origin", "https://github.com/repo", custom)).toBeUndefined();
    expect(parseRemote("origin", "/srv/git/repo.git", custom)).toBeUndefined();
    expect(parseRemote("origin", "not a remote", custom)).toBeUndefined();
  });
});

describe("chooseRemote", () => {
  const forges: Forges = { "github.com": "github", "git.example.com": "gitlab" };
  const config = [
    "remote.upstream.url git@github.com:them/repo.git",
    "remote.origin.url git@git.example.com:team/repo.git",
    "remote.other.url git@unknown.example:x/y.git",
  ].join("\n");

  it("prefers the branch's remote, then origin", () => {
    expect(chooseRemote(config, "upstream", forges)?.name).toBe("upstream");
    expect(chooseRemote(config, "", forges)?.name).toBe("origin");
    expect(chooseRemote(config, ".", forges)?.name).toBe("origin");
  });

  it("sees a self-hosted origin only through the map", () => {
    expect(chooseRemote(config, "origin", forges)?.web).toBe("https://git.example.com/team/repo");
    expect(chooseRemote(config, "origin")?.name).toBe("upstream");
  });

  it("takes a lone supported remote that is not called origin", () => {
    expect(chooseRemote("remote.fork.url git@github.com:me/repo.git", "", forges)?.name).toBe(
      "fork",
    );
  });

  it("gives none when several are supported and none is the choice", () => {
    const two = "remote.a.url git@github.com:a/r.git\nremote.b.url git@github.com:b/r.git";
    expect(chooseRemote(two, "", forges)).toBeUndefined();
  });

  it("reads the fetch URL when a remote lists two", () => {
    const both =
      "remote.origin.url git@github.com:me/repo.git\nremote.origin.url git@github.com:me/other.git";
    expect(chooseRemote(both, "origin", forges)?.repo).toBe("repo");
  });
});

describe("gitMenu", () => {
  it("offers the pull request first, and the branch, repository and copies", () => {
    const menu = gitMenu({ status: PUSHED, remote: GITHUB, base: "main", pr: OPEN });
    expect(ids(menu)).toEqual(["repo", "branch", "pr", "create", "copy", "copy-pr"]);
    expect(menu.preferred).toBe("pr");
    expect(menu.context).toBe("me/repo");
    expect(row(menu, "pr")?.action).toEqual({ kind: "url", url: OPEN.url });
    expect(row(menu, "create")).toMatchObject({ unavailable: "PR #12 is open" });
    expect(row(menu, "create")?.action).toBeUndefined();
  });

  it("links the compare page into the base when there is no pull request", () => {
    const menu = gitMenu({ status: PUSHED, remote: GITHUB, base: "release/1", pr: null });
    expect(menu.preferred).toBe("branch");
    expect(row(menu, "create")).toMatchObject({
      description: "into release/1",
      action: {
        kind: "url",
        url: "https://github.com/me/repo/compare/release/1...feat/x?expand=1",
      },
    });
  });

  it("calls the row for a finished pull request a new one", () => {
    const merged = gitMenu({
      status: PUSHED,
      remote: GITHUB,
      base: "main",
      pr: { ...OPEN, state: "merged" },
    });
    expect(row(merged, "create")).toMatchObject({ label: "Create new pull request" });
    expect(row(merged, "create")?.action).toBeDefined();
  });

  it("says why create cannot run", () => {
    const create = (over: Partial<Parameters<typeof gitMenu>[0]>) =>
      row(gitMenu({ status: PUSHED, remote: GITHUB, base: "main", pr: null, ...over }), "create")
        ?.unavailable;
    expect(create({ status: { ...PUSHED, upstream: false } })).toBe("push the branch first");
    expect(create({ pr: "no-gh" })).toBe("gh not installed");
    expect(create({ pr: "unknown" })).toBe("gh could not say");
    expect(create({ status: { ...PUSHED, branch: null } })).toBe("detached HEAD");
    expect(create({ remote: { ...GITHUB, forge: "gitlab" } })).toBe("GitHub only");
    expect(create({ remote: undefined })).toBe("no supported remote");
  });

  it("builds each forge's own branch and commit links", () => {
    const at = (forge: Remote["forge"], status = PUSHED) =>
      gitMenu({
        status,
        remote: { ...GITHUB, forge, host: "h.example", web: "https://h.example/me/repo" },
        base: "main",
        pr: null,
      });
    const url = (menu: ReturnType<typeof gitMenu>, id: string) => {
      const action = row(menu, id)?.action;
      return action?.kind === "url" ? action.url : undefined;
    };
    expect(url(at("github"), "branch")).toBe("https://h.example/me/repo/tree/feat/x");
    expect(url(at("gitlab"), "branch")).toBe("https://h.example/me/repo/-/tree/feat/x");
    expect(url(at("codeberg"), "branch")).toBe("https://h.example/me/repo/src/branch/feat/x");
    const detached = { ...PUSHED, branch: null };
    expect(url(at("github", detached), "commit")).toBe(
      "https://h.example/me/repo/commit/abc1234def5678",
    );
    expect(url(at("gitlab", detached), "commit")).toBe(
      "https://h.example/me/repo/-/commit/abc1234def5678",
    );
  });

  it("encodes a branch name that is not a plain path", () => {
    const menu = gitMenu({
      status: { ...PUSHED, branch: "fix/#12 retry" },
      remote: GITHUB,
      base: "main",
      pr: null,
    });
    expect(row(menu, "branch")?.action).toEqual({
      kind: "url",
      url: "https://github.com/me/repo/tree/fix/%2312%20retry",
    });
  });

  it("on a detached HEAD offers the short commit and copies the full SHA", () => {
    const menu = gitMenu({
      status: { ...PUSHED, branch: null },
      remote: GITHUB,
      base: "main",
      pr: null,
    });
    expect(row(menu, "commit")?.label).toBe("Open commit abc1234");
    expect(row(menu, "copy")?.action).toEqual({
      kind: "copy",
      text: "abc1234def5678",
      what: "commit SHA",
    });
    expect(menu.preferred).toBe("commit");
  });

  it("keeps every link row in place, unavailable, without a remote", () => {
    const menu = gitMenu({ status: PUSHED, remote: undefined, base: "main", pr: null });
    expect(ids(menu)).toEqual(["repo", "branch", "create", "copy"]);
    expect(menu.preferred).toBe("repo");
    expect(menu.context).toBeUndefined();
    for (const id of ["repo", "branch"])
      expect(row(menu, id)).toMatchObject({ unavailable: "no supported remote" });
  });
});

describe("folderMenu", () => {
  const none: Installed = { commands: new Map(), paths: new Set() };
  const some: Installed = {
    commands: new Map([
      ["code", "/usr/bin/code"],
      ["xdg-open", "/usr/bin/xdg-open"],
      ["nautilus", "/usr/bin/nautilus"],
    ]),
    paths: new Set(),
  };
  const offered = (installed: Installed, dir = "/repo") =>
    choices(builtinApps("linux"), installed, { kind: "dir", dir });

  it("has a row for each app that takes a folder, then Copy path", () => {
    const menu = folderMenu("/repo", offered(some));
    expect(menu.kind).toBe("folder");
    expect(menu.title).toBe("Open folder");
    expect(ids(menu)).toEqual(["code", "zed", "smerge", "files", "terminal", "copy"]);
    expect(row(menu, "code")?.action).toEqual({
      kind: "launch",
      argv: ["/usr/bin/code", "/repo"],
      cwd: "/repo",
    });
    expect(row(menu, "copy")?.action).toEqual({ kind: "copy", text: "/repo", what: "path" });
  });

  it("keeps an app that is not installed in its place and says so", () => {
    const menu = folderMenu("/repo", offered(some));
    expect(row(menu, "zed")).toMatchObject({ label: "Zed", unavailable: "not installed" });
    expect(row(menu, "zed")?.action).toBeUndefined();
  });

  it("preselects the first app that can run", () => {
    expect(folderMenu("/repo", offered(some)).preferred).toBe("code");
    const filesOnly: Installed = {
      commands: new Map([["xdg-open", "/usr/bin/xdg-open"]]),
      paths: new Set(),
    };
    expect(folderMenu("/repo", offered(filesOnly)).preferred).toBe("files");
  });

  it("has no preselected row when nothing is installed, and Copy path still works", () => {
    const menu = folderMenu("/repo", offered(none));
    expect(menu.preferred).toBeUndefined();
    expect(row(menu, "copy")?.action).toBeDefined();
  });

  it("starts a terminal in the folder", () => {
    const withTerminal: Installed = {
      commands: new Map([["xdg-terminal-exec", "/usr/bin/xdg-terminal-exec"]]),
      paths: new Set(),
    };
    const menu = folderMenu("/a b", offered(withTerminal, "/a b"));
    expect(row(menu, "terminal")?.action).toEqual({
      kind: "launch",
      argv: ["/usr/bin/xdg-terminal-exec", "--dir=/a b"],
      cwd: "/a b",
    });
  });
});
