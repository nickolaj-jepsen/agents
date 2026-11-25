import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type App,
  builtinApps,
  choices,
  configPath,
  type Installed,
  preferred,
  probeArgv,
  readConfig,
  readProbe,
} from "./apps.ts";

const installed = (commands: Record<string, string>, paths: string[] = []): Installed => ({
  commands: new Map(Object.entries(commands)),
  paths: new Set(paths),
});

const ids = (apps: readonly App[]) => apps.map((app) => app.id);

describe("configPath", () => {
  it("prefers XDG_CONFIG_HOME and falls back to ~/.config", () => {
    expect(configPath({ XDG_CONFIG_HOME: "/x", HOME: "/h" })).toBe("/x/agents/open.json");
    expect(configPath({ HOME: "/h" })).toBe("/h/.config/agents/open.json");
    expect(configPath({})).toBeUndefined();
  });
});

describe("readConfig", () => {
  it("is the built-in table with no file, an empty one or a broken one", () => {
    const builtin = ids(builtinApps("linux"));
    expect(ids(readConfig(undefined, "linux").apps)).toEqual(builtin);
    expect(ids(readConfig("  ", "linux").apps)).toEqual(builtin);
    const broken = readConfig("{", "linux");
    expect(ids(broken.apps)).toEqual(builtin);
    expect(broken.problems[0]).toMatch(/not JSON/);
  });

  it("lists the file's apps first, in its order, then the rest of the table", () => {
    const config = readConfig(
      JSON.stringify({
        apps: [{ id: "zed" }, { id: "lazygit", command: "lazygit", dir: ["-p", "{dir}"] }],
      }),
      "linux",
    );
    expect(ids(config.apps)).toEqual([
      "zed",
      "lazygit",
      "code",
      "smerge",
      "files",
      "terminal",
      "browser",
    ]);
    expect(config.problems).toEqual([]);
    expect(config.apps[1]).toEqual({
      id: "lazygit",
      label: "lazygit",
      command: ["lazygit"],
      dir: ["-p", "{dir}"],
    });
  });

  it("lays an entry over the built-in app of its id", () => {
    const [zed] = readConfig(
      JSON.stringify({ apps: [{ id: "zed", label: "Zed Preview", command: "zed-preview" }] }),
      "linux",
    ).apps;
    expect(zed).toMatchObject({
      label: "Zed Preview",
      command: ["zed-preview"],
      dir: ["{dir}"],
      file: ["{file}:{line}"],
    });
  });

  it("drops a macOS bundle check when the command is replaced", () => {
    const [code] = readConfig(
      JSON.stringify({ apps: [{ id: "code", command: "code", dir: ["{dir}"] }] }),
      "mac",
    ).apps;
    expect(code?.requires).toBeUndefined();
  });

  it("hides a built-in app, and takes a target away with null", () => {
    const config = readConfig(
      JSON.stringify({
        apps: [
          { id: "smerge", hidden: true },
          { id: "code", file: null },
        ],
      }),
      "linux",
    );
    expect(ids(config.apps)).not.toContain("smerge");
    expect(config.apps[0]?.file).toBeUndefined();
  });

  it("leaves a broken entry out and says so", () => {
    const config = readConfig(
      JSON.stringify({
        apps: [
          { label: "nameless" },
          { id: "new" },
          { id: "bare", command: "bare" },
          { id: "zed", dir: "oops" },
          { id: "code" },
          { id: "code" },
        ],
        forges: { "Git.Example.com": "gitlab", bad: 1 },
      }),
      "linux",
    );
    expect(config.problems).toHaveLength(6);
    // The broken zed entry takes the built-in one with it; the first `code` counts.
    expect(ids(config.apps)).toEqual(["code", "smerge", "files", "terminal", "browser"]);
    expect(config.forges).toEqual({ "git.example.com": "gitlab" });
  });
});

describe("choices", () => {
  const apps = readConfig(
    JSON.stringify({
      apps: [{ id: "lazygit", command: "lazygit", dir: ["-p", "{dir}"], terminal: true }],
    }),
    "linux",
  ).apps;

  it("offers the apps that take the target, the missing ones in place", () => {
    const offered = choices(apps, installed({ zeditor: "/bin/zeditor" }), {
      kind: "dir",
      dir: "/work",
    });
    expect(offered.map((c) => [c.app.id, c.argv?.join(" ") ?? c.unavailable])).toEqual([
      ["lazygit", "not installed"],
      ["code", "not installed"],
      ["zed", "/bin/zeditor /work"],
      ["smerge", "not installed"],
      ["files", "not installed"],
      ["terminal", "not installed"],
    ]);
    expect(preferred(offered)?.app.id).toBe("zed");
    expect(preferred(offered)?.cwd).toBe("/work");
  });

  it("fills a file's line, or drops it", () => {
    const has = installed({ code: "/bin/code", zed: "/bin/zed" });
    const at = (line?: number) =>
      choices(apps, has, { kind: "file", file: "/work/a.md", line }).map((c) => c.argv);
    expect(at(12)).toEqual([
      ["/bin/code", "--reuse-window", "--goto", "/work/a.md:12"],
      ["/bin/zed", "/work/a.md:12"],
    ]);
    expect(at()).toEqual([
      ["/bin/code", "--reuse-window", "--goto", "/work/a.md"],
      ["/bin/zed", "/work/a.md"],
    ]);
  });

  it("offers a link to the browser alone", () => {
    const offered = choices(apps, installed({ "xdg-open": "/bin/xdg-open" }), {
      kind: "url",
      url: "https://example.com",
    });
    expect(offered.map((c) => c.argv)).toEqual([["/bin/xdg-open", "https://example.com"]]);
  });

  it("starts a terminal program in a window of the terminal app", () => {
    const has = { lazygit: "/bin/lazygit" };
    const target = { kind: "dir", dir: "/work" } as const;
    expect(choices(apps, installed(has), target)[0]?.unavailable).toBe("no terminal to run it in");
    const [lazygit] = choices(
      apps,
      installed({ ...has, "xdg-terminal-exec": "/bin/xdg-terminal-exec" }),
      target,
    );
    expect(lazygit?.argv).toEqual([
      "/bin/xdg-terminal-exec",
      "--dir=/work",
      "/bin/lazygit",
      "-p",
      "/work",
    ]);
  });

  it("asks for a macOS app's bundle", () => {
    const mac = builtinApps("mac");
    const target = { kind: "dir", dir: "/work" } as const;
    const open = { open: "/usr/bin/open" };
    expect(choices(mac, installed(open), target)[0]?.unavailable).toBe("not installed");
    expect(
      choices(mac, installed(open, ["/Applications/Visual Studio Code.app"]), target)[0]?.argv,
    ).toEqual(["/usr/bin/open", "-a", "Visual Studio Code", "/work"]);
  });
});

describe("the probe", () => {
  it("finds commands on PATH, by name or by path, and paths that exist", () => {
    const home = mkdtempSync(join(tmpdir(), "launch-probe-"));
    const tool = join(home, "tool");
    writeFileSync(tool, "#!/bin/sh\n");
    chmodSync(tool, 0o755);
    const apps: App[] = [
      { id: "a", label: "a", command: ["sh", "surely-not-a-command"], dir: [] },
      { id: "b", label: "b", command: [tool], requires: home, dir: [] },
      { id: "c", label: "c", command: ["sh"], requires: join(home, "missing"), dir: [] },
    ];
    const [command, ...args] = probeArgv(apps);
    const found = readProbe(execFileSync(command as string, args, { encoding: "utf8" }));
    expect([...found.commands.keys()].sort()).toEqual([tool, "sh"].sort());
    expect(found.commands.get(tool)).toBe(tool);
    expect(found.commands.get("sh")).toMatch(/^\//);
    expect([...found.paths]).toEqual([home]);
  });
});
