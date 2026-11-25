/**
 * The host pi's half runs the shared steps over (`../lib/gather.ts`): node's processes and files.
 */
import { execFile } from "node:child_process";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { configPath } from "@agents/launch/apps.ts";
import type { Host, Ran } from "../lib/gather.ts";
import type { Listed } from "../lib/walk.ts";

/** Most a command may print before it is cut: the ensure script and the probe print a few lines. */
const MAX_OUTPUT = 4 * 1024 * 1024;

/** Runs a command to its end: its status and what it printed, or nothing when it never ran. */
const runIn =
  (env: NodeJS.ProcessEnv) =>
  (argv: string[], o: { cwd?: string; timeoutMs?: number } = {}): Promise<Ran | undefined> =>
    new Promise((resolve) => {
      const [command, ...args] = argv;
      if (!command) return resolve(undefined);
      execFile(
        command,
        args,
        {
          cwd: o.cwd,
          env,
          timeout: o.timeoutMs ?? 30_000,
          encoding: "utf8",
          maxBuffer: MAX_OUTPUT,
        },
        (error, stdout) => {
          // A number is the status it exited with; anything else (ENOENT, a signal) is no run.
          if (error && typeof error.code !== "number") return resolve(undefined);
          resolve({ exitCode: error ? Number(error.code) : 0, stdout });
        },
      );
    });

async function list(dir: string): Promise<Listed[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return Promise.all(
    entries.map(async (entry): Promise<Listed> => {
      if (entry.isDirectory()) return { name: entry.name, kind: "dir", mtimeMs: 0 };
      if (!entry.isFile()) return { name: entry.name, kind: "other", mtimeMs: 0 };
      const at = await lstat(join(dir, entry.name)).catch(() => undefined);
      return { name: entry.name, kind: "file", mtimeMs: at?.mtimeMs ?? 0 };
    }),
  );
}

/** The host for an environment: the session's own, or a test's. */
export function nodeHost(env: NodeJS.ProcessEnv = process.env): Host {
  return {
    run: runIn(env),
    list,
    realPath: (path) => realpath(path).catch(() => undefined),
    size: async (path) => {
      const at = await stat(path).catch(() => undefined);
      return at?.isFile() ? at.size : undefined;
    },
    read: (path) => readFile(path, "utf8"),
    config: async () => {
      const path = configPath(env);
      const text = path ? await readFile(path, "utf8").catch(() => undefined) : undefined;
      return { text, platform: process.platform === "darwin" ? "mac" : "linux" };
    },
  };
}
