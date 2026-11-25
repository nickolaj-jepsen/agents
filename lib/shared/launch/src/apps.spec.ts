import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type App,
  builtinApps,
  choices,
  configPath,
  DETACH,
  type Installed,
  preferred,
  probeArgv,
  readConfig,
  readProbe,
  readyChecks,
} from "./apps.ts";

const installed = (commands: Record<string, string>, paths: string[] = []): Installed => ({
  commands: new Map(Object.entries(commands)),
  paths: new Set(paths),
});

const ids = (apps: readonly App[]) => apps.map((app) => app.id);

describe("reserved ids", () => {
  it.each(["copy", "more", "frame:close", "frame:keep", "kit-key-1", "kit-ring"])(
    "leaves out an app named %s",
    (id) => {
      const config = readConfig(
        JSON.stringify({ apps: [{ id, command: "sh", dir: ["{dir}"] }] }),
        "linux",
      );
      expect(config.problems).toEqual([`apps[0] (${id}): "${id}" is a reserved id; left out`]);
      expect(ids(config.apps)).toEqual(ids(builtinApps("linux")));
    },
  );

  it("still takes an id that only starts like one", () => {
    const config = readConfig(
      JSON.stringify({ apps: [{ id: "copyq", command: "copyq", dir: ["{dir}"] }] }),
      "linux",
    );
    expect(config.problems).toEqual([]);
    expect(ids(config.apps)[0]).toBe("copyq");
  });
});

describe("ready", () => {
  const terminal = builtinApps("linux").find((app) => app.id === "terminal");
  const apps = builtinApps("linux");
  const found = installed({
    "xdg-terminal-exec": "/usr/bin/xdg-terminal-exec",
    code: "/usr/bin/code",
  });

  it("is set on the built-in Linux terminal and on no macOS app", () => {
    expect(terminal?.ready).toEqual(["--print-id"]);
    expect(builtinApps("mac").some((app) => app.ready)).toBe(false);
  });

  it("lists a check for each installed app that has one, behind its found command", () => {
    expect(readyChecks(apps, found)).toEqual([
      { id: "terminal", argv: ["/usr/bin/xdg-terminal-exec", "--print-id"] },
    ]);
    expect(readyChecks(apps, installed({ code: "/usr/bin/code" }))).toEqual([]);
  });

  it("marks an installed app that is not set up, and keeps the rest", () => {
    const target = { kind: "dir", dir: "/repo" } as const;
    const offered = choices(apps, { ...found, unready: new Set(["terminal"]) }, target);
    const row = offered.find((c) => c.app.id === "terminal");
    expect(row).toEqual({ app: terminal, unavailable: "not set up" });
    expect(offered.find((c) => c.app.id === "code")?.argv).toBeDefined();
    // A missing app is still missing, not unready.
    expect(
      choices(apps, { ...installed({}), unready: new Set(["terminal"]) }, target).find(
        (c) => c.app.id === "terminal",
      )?.unavailable,
    ).toBe("not installed");
  });

  it("leaves a program that needs a terminal with no terminal to run it in", () => {
    const config = readConfig(
      JSON.stringify({ apps: [{ id: "nvim", command: "nvim", dir: ["{dir}"], terminal: true }] }),
      "linux",
    );
    const both = installed({ "xdg-terminal-exec": "/x/xdg-terminal-exec", nvim: "/x/nvim" });
    const target = { kind: "dir", dir: "/repo" } as const;
    expect(choices(config.apps, both, target)[0]?.argv).toBeDefined();
    const unready = { ...both, unready: new Set(["terminal"]) };
    expect(choices(config.apps, unready, target)[0]?.unavailable).toBe("no terminal to run it in");
  });

  it("is dropped with the command it was for, and read from open.json", () => {
    const own = readConfig(
      JSON.stringify({ apps: [{ id: "terminal", command: "kitty", dir: ["{dir}"] }] }),
      "linux",
    ).apps[0];
    expect(own?.ready).toBeUndefined();
    const set = readConfig(
      JSON.stringify({ apps: [{ id: "x", command: "x", dir: ["{dir}"], ready: ["--ok"] }] }),
      "linux",
    ).apps[0];
    expect(set?.ready).toEqual(["--ok"]);
    const bad = readConfig(
      JSON.stringify({ apps: [{ id: "x", command: "x", dir: ["{dir}"], ready: 3 }] }),
      "linux",
    );
    expect(bad.problems).toEqual(['apps[0] (x): "ready" is not a list of arguments; left out']);
    const removed = readConfig(
      JSON.stringify({ apps: [{ id: "terminal", ready: null }] }),
      "linux",
    );
    expect(removed.apps[0]?.ready).toBeUndefined();
  });
});

describe("configPath", () => {
  it("prefers XDG_CONFIG_HOME and falls back to ~/.config", () => {
    expect(configPath({ XDG_CONFIG_HOME: "/x", HOME: "/h" })).toBe("/x/agents/open.json");
    expect(configPath({ HOME: "/h" })).toBe("/h/.config/agents/open.json");
    expect(configPath({})).toBeUndefined();
    expect(configPath({ XDG_CONFIG_HOME: "rel", HOME: "/h" })).toBe("/h/.config/agents/open.json");
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

  it("keeps a $ in a path or a link as it is", () => {
    const has = installed({ code: "/bin/code", "xdg-open": "/bin/xdg-open", nautilus: "/bin/n" });
    const file = choices(apps, has, { kind: "file", file: "/w/a$$b $&.md", line: 3 });
    expect(file[0]?.argv?.at(-1)).toBe("/w/a$$b $&.md:3");
    const dir = choices(apps, has, { kind: "dir", dir: "/srv/$$app" });
    expect(dir.find((c) => c.app.id === "code")?.argv).toEqual(["/bin/code", "/srv/$$app"]);
    const url = choices(apps, has, { kind: "url", url: "https://h/p?a=$&b=1" });
    expect(url[0]?.argv).toEqual(["/bin/xdg-open", "https://h/p?a=$&b=1"]);
  });

  it("fills {dir} for a file with its folder", () => {
    const custom = readConfig(
      JSON.stringify({
        apps: [{ id: "ed", command: "ed", file: ["-w", "{dir}", "{file}:{line}"] }],
      }),
      "linux",
    ).apps;
    const [ed] = choices(custom, installed({ ed: "/bin/ed" }), { kind: "file", file: "/w/x/a.md" });
    expect(ed?.argv).toEqual(["/bin/ed", "-w", "/w/x", "/w/x/a.md"]);
  });

  it("runs a terminal program in a terminal that names a path it requires", () => {
    const custom = readConfig(
      JSON.stringify({
        apps: [
          { id: "terminal", command: "kitty", requires: "/opt/kitty", dir: ["-d", "{dir}"] },
          { id: "lazygit", command: "lazygit", dir: ["-p", "{dir}"], terminal: true },
        ],
      }),
      "linux",
    ).apps;
    const has = installed({ kitty: "/bin/kitty", lazygit: "/bin/lazygit" }, ["/opt/kitty"]);
    const lazygit = choices(custom, has, { kind: "dir", dir: "/w" }).find(
      (c) => c.app.id === "lazygit",
    );
    expect(lazygit?.argv).toEqual(["/bin/kitty", "-d", "/w", "/bin/lazygit", "-p", "/w"]);
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

describe("DETACH", () => {
  it("starts the command and returns before it ends", async () => {
    const dir = mkdtempSync(join(tmpdir(), "launch-detach-"));
    const done = join(dir, "done");
    const [command, ...args] = [...DETACH, "sh", "-c", `sleep 1; touch '${done}'`];
    const started = Date.now();
    execFileSync(command as string, args);
    expect(Date.now() - started).toBeLessThan(900);
    for (let i = 0; i < 40 && !existsSync(done); i++) await new Promise((r) => setTimeout(r, 100));
    expect(existsSync(done)).toBe(true);
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
