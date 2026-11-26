import { describe, expect, it } from "vitest";
import { builtinApps, probeArgv, readConfig } from "./apps.ts";
import { LOAD_TIMES, loadApps, type LoadHost, type Ran } from "./load.ts";

type Asked = { argv: string[]; timeoutMs: number };

type Machine = {
  /** `open.json`'s text; none for a machine with no file. */
  config?: string;
  platform?: "mac" | "linux";
  /** The commands the probe finds, each at the path here. */
  found?: Record<string, string>;
  /** The commands whose readiness check exits 1: an app that says it is not set up. */
  unready?: string[];
  /** The commands whose readiness check cannot run at all, as one that ran out of time. */
  silent?: string[];
};

/**
 * A host that answers the probe from `found` and each readiness check from `unready` and `silent`,
 * and remembers every command it was asked to run.
 */
function fakeHost(m: Machine = {}) {
  const asked: Asked[] = [];
  const found = m.found ?? {};
  const byPath = new Map(Object.entries(found).map(([name, path]) => [path, name]));
  const host: LoadHost = {
    async run(argv, timeoutMs): Promise<Ran | undefined> {
      asked.push({ argv, timeoutMs });
      // The probe: `sh -c <script> sh <commands> -- <paths>`.
      if (argv[0] === "sh" && argv[1] === "-c") {
        const names = argv.slice(4, argv.indexOf("--", 4));
        const lines = names
          .filter((name) => name in found)
          .map((name) => `c\t${name}\t${found[name]}\n`);
        return { exitCode: 0, stdout: lines.join("") };
      }
      // A readiness check: the found command, then the app's `ready` arguments.
      const name = byPath.get(argv[0] ?? "");
      if (m.silent?.includes(name ?? "")) return undefined;
      return { exitCode: m.unready?.includes(name ?? "") ? 1 : 0, stdout: "" };
    },
    config: async () => ({ text: m.config, platform: m.platform ?? "linux" }),
  };
  return { host, asked };
}

/** An app of `open.json` that carries a readiness check, which is all loading looks at. */
const checked = (id: string, command: string) => ({
  id,
  command,
  dir: ["{dir}"],
  ready: ["--print-id"],
});

describe("loadApps", () => {
  it("reads the file, probes once, then asks each installed app whether it is set up", async () => {
    const { host, asked } = fakeHost({
      found: { "xdg-terminal-exec": "/usr/bin/xdg-terminal-exec" },
    });
    const loaded = await loadApps(host);
    expect(asked[0]).toEqual({
      argv: probeArgv(readConfig(undefined, "linux").apps),
      timeoutMs: LOAD_TIMES.probeMs,
    });
    // Only the built-in Linux terminal carries a check, and it is run behind the found command.
    expect(asked.slice(1)).toEqual([
      { argv: ["/usr/bin/xdg-terminal-exec", "--print-id"], timeoutMs: LOAD_TIMES.readyMs },
    ]);
    expect(loaded.installed.commands.get("xdg-terminal-exec")).toBe("/usr/bin/xdg-terminal-exec");
    expect(loaded.installed.unready).toBeUndefined();
  });

  it("marks an app whose check exits 1, or never got an answer, as not set up", async () => {
    const { host } = fakeHost({
      config: JSON.stringify({
        apps: [
          checked("failed", "app-fails"),
          checked("timed-out", "app-silent"),
          checked("ready", "app-ready"),
        ],
      }),
      found: {
        "app-fails": "/x/app-fails",
        "app-silent": "/x/app-silent",
        "app-ready": "/x/app-ready",
      },
      unready: ["app-fails"],
      silent: ["app-silent"],
    });
    const loaded = await loadApps(host);
    expect([...(loaded.installed.unready ?? [])]).toEqual(["failed", "timed-out"]);
    expect(loaded.config.problems).toEqual([]);
    // Everything found stays installed: a check only takes an app's place away, not its row.
    expect([...loaded.installed.commands.keys()].sort()).toEqual([
      "app-fails",
      "app-ready",
      "app-silent",
    ]);
  });

  it("has no unready set when the table has no checks, and runs none", async () => {
    const { host, asked } = fakeHost({ found: { code: "/usr/bin/code" } });
    const loaded = await loadApps(host);
    expect(asked).toHaveLength(1);
    expect(loaded.installed).not.toHaveProperty("unready");
    expect(loaded.installed.commands.get("code")).toBe("/usr/bin/code");
  });

  it("runs no check for an app that is not installed, or whose path is missing", async () => {
    const { host, asked } = fakeHost({
      config: JSON.stringify({
        apps: [
          checked("absent", "not-here"),
          { ...checked("bundled", "sh"), requires: "/opt/bundled" },
        ],
      }),
      found: { sh: "/bin/sh" },
    });
    await loadApps(host);
    expect(asked).toHaveLength(1);
  });

  it("takes the caller's times, and the default for the one it leaves out", async () => {
    const { host, asked } = fakeHost({
      found: { "xdg-terminal-exec": "/usr/bin/xdg-terminal-exec" },
    });
    await loadApps(host, { probeMs: 4000 });
    expect(asked.map((call) => call.timeoutMs)).toEqual([4000, LOAD_TIMES.readyMs]);
    const second = fakeHost({ found: { "xdg-terminal-exec": "/usr/bin/xdg-terminal-exec" } });
    await loadApps(second.host, { probeMs: 4000, readyMs: 200 });
    expect(second.asked.map((call) => call.timeoutMs)).toEqual([4000, 200]);
  });

  it("keeps what the file got wrong for the caller to say, and probes the built-in table", async () => {
    const { host, asked } = fakeHost({ config: JSON.stringify({ apps: [{ label: "x" }] }) });
    const loaded = await loadApps(host);
    expect(loaded.config.problems).toEqual(['apps[0] has no "id"; left out']);
    expect(loaded.config.apps).toEqual(builtinApps("linux"));
    expect(asked[0]?.argv).toEqual(probeArgv(builtinApps("linux")));
  });
});
