/**
 * What the shared gathering (`../lib/gather.ts`) asks of pi: node runs git, gh and the probe and
 * starts the app, `open.json` is read from disk, and the clipboard is pi's own (`/copy`'s).
 */
import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { copyToClipboard } from "@earendil-works/pi-coding-agent";
import { configPath } from "@agents/launch/apps.ts";
import type { Host, PressHost, Ran } from "../lib/gather.ts";

/** What git, gh and the probe may print: far more than any of them does. */
const MAX_OUTPUT = 4 * 1024 * 1024;

/**
 * Runs a command to its end. Nothing when it could not start (not installed, no such folder);
 * a command that failed or ran out of time is a result that is not a success.
 */
export function run(argv: string[], timeoutMs: number, cwd?: string): Promise<Ran | undefined> {
  const [file, ...args] = argv;
  if (!file) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    try {
      execFile(
        file,
        args,
        { cwd, timeout: timeoutMs, encoding: "utf8", maxBuffer: MAX_OUTPUT },
        (error, stdout, stderr) => {
          if (!error) return resolve({ exitCode: 0, stdout, stderr });
          // A spawn error has a name for a code (`ENOENT`); an exit has its number.
          if (typeof error.code === "string") return resolve(undefined);
          resolve({ exitCode: typeof error.code === "number" ? error.code : -1, stdout, stderr });
        },
      );
    } catch {
      resolve(undefined);
    }
  });
}

/** `open.json` as text, if it is there, and the platform its apps are for. */
export async function config(): Promise<Awaited<ReturnType<Host["config"]>>> {
  const path = configPath(process.env);
  const text = path ? await readFile(path, "utf8").catch(() => undefined) : undefined;
  return { text, platform: process.platform === "darwin" ? "mac" : "linux" };
}

/**
 * Starts an app without waiting for it: a session of its own, no output, not held by pi.
 * @returns Whether it started.
 */
export function start(argv: string[], cwd?: string): Promise<boolean> {
  const [file, ...args] = argv;
  if (!file) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const child = spawn(file, args, { cwd, detached: true, stdio: "ignore" });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

export async function copy(text: string): ReturnType<PressHost["copy"]> {
  try {
    await copyToClipboard(text);
    return { isCopied: true };
  } catch (error) {
    return { isCopied: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** A host that says what `open.json` got wrong through `report`. */
export const nodeHost = (report: Host["report"]): Host => ({ run, config, report });

/** A host that also carries a press out, and says how it went through `say`. */
export const nodePressHost = (report: Host["report"], say: PressHost["say"]): PressHost => ({
  run,
  config,
  report,
  copy,
  start,
  say,
});
