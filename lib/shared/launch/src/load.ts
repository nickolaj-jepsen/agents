/**
 * The apps of `open.json`, loaded: the file, then one probe of what the session has, then each
 * installed app's `ready` check. Pure: a harness runs the probe and the checks, so the order and
 * how long each step gets are here, and a menu and a hand-off see the same apps.
 */
import {
  type Config,
  type Installed,
  type Platform,
  probeArgv,
  readyChecks,
  readConfig,
  readProbe,
} from "./apps.ts";

/** A command run to its end: as much of what it printed and how it ended as loading asks for. */
export type Ran = { exitCode: number; stdout: string };

/** What loading asks of a harness: the probe and the readiness checks, and the person's file. */
export type LoadHost = {
  /** Runs a command to its end in `timeoutMs`; nothing when it could not be started at all. */
  run(argv: string[], timeoutMs: number): Promise<Ran | undefined>;
  /** `open.json`'s text, if it is there, and the platform its apps are for. */
  config(): Promise<{ text: string | undefined; platform: Platform }>;
};

/** How long each step may take: the probe, then an app's readiness check. */
export type LoadTimes = { probeMs: number; readyMs: number };

/**
 * The times of a caller that names none: a probe of the session's `PATH`, and a check that asks a
 * program one question about itself, so it should be quick.
 */
export const LOAD_TIMES: LoadTimes = { probeMs: 3000, readyMs: 1500 };

/** The apps on offer, and which of them are installed and set up. */
export type Loaded = { config: Config; installed: Installed };

/**
 * Reads `open.json`, asks the session which of the apps' commands and paths exist, and asks each
 * installed app that carries a `ready` check whether it is set up.
 * @param times How long the probe and each check may take; `LOAD_TIMES` for the steps it leaves out.
 * @returns The config, and what is installed: an app whose check failed, or ran out of time, is in
 * `installed.unready` and the rest of the table is left as it was.
 */
export async function loadApps(host: LoadHost, times: Partial<LoadTimes> = {}): Promise<Loaded> {
  const { text, platform } = await host.config();
  const config = readConfig(text, platform);
  const probe = await host.run(probeArgv(config.apps), times.probeMs ?? LOAD_TIMES.probeMs);
  const found = readProbe(probe?.stdout ?? "");
  // An app that is installed but says it is not set up (no terminal chosen) is passed over.
  const checks = readyChecks(config.apps, found);
  const ran = await Promise.all(
    checks.map((check) => host.run(check.argv, times.readyMs ?? LOAD_TIMES.readyMs)),
  );
  const unready = new Set(checks.filter((_, i) => ran[i]?.exitCode !== 0).map((check) => check.id));
  return { config, installed: unready.size ? { ...found, unready } : found };
}
