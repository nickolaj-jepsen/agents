/**
 * The real flock(2) helper for the specs.
 *
 * `agents-flock` is built by Nix and named by the wrapper (`AGENTS_FLOCK`); a checkout without Nix
 * compiles the same C program once with the system compiler. There is deliberately no fallback
 * interpreter: if an explicit helper is missing or the compiler fails, the specs fail here with
 * the compiler's own output rather than quietly testing something else.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

export type HelperLookup = {
  env?: NodeJS.ProcessEnv;
  /** Where a name would be found; the specs inject this to prove each failure mode. */
  which?: (name: string) => string | undefined;
  /** Build the C helper; the specs inject a failure to prove it is not masked. */
  compile?: (compiler: string, source: string, target: string) => void;
  makeDirectory?: () => string;
};

const isExecutable = (path: string): boolean => {
  try {
    fs.accessSync(path, fs.constants.X_OK);
    return fs.statSync(path).isFile();
  } catch {
    return false;
  }
};

const onPath = (name: string): string | undefined => {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    if (isExecutable(candidate)) return candidate;
  }
  return undefined;
};

export const helperSource = (): string =>
  fileURLToPath(new URL("../../../../../pkgs/agents-flock.c", import.meta.url));

function compileHelper(compiler: string, source: string, target: string): void {
  try {
    execFileSync(compiler, ["-O2", "-o", target, source], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    const detail = stderr.trim() || (error instanceof Error ? error.message : String(error));
    throw new Error(detail);
  }
}

function makeDirectory(): string {
  return fs.mkdtempSync(join(os.tmpdir(), "agents-flock-helpers-"));
}

/**
 * The helper `AGENTS_FLOCK` names, else `agents-flock` on PATH, else the C source compiled once.
 * A named-but-unusable helper and a failed compilation are errors: nothing here substitutes a
 * different lock implementation, because the suites must exercise the one that ships.
 */
export function resolveFlockHelper(lookup: HelperLookup = {}): string {
  const env = lookup.env ?? process.env;
  const which = lookup.which ?? onPath;
  if (env.AGENTS_FLOCK) {
    if (!isExecutable(env.AGENTS_FLOCK)) {
      throw new Error(
        `AGENTS_FLOCK=${env.AGENTS_FLOCK} is not an executable file; point it at a build of ` +
          `${helperSource()} (or unset it to compile it here)`,
      );
    }
    return env.AGENTS_FLOCK;
  }
  const declared = which("agents-flock");
  if (declared !== undefined) return declared;
  const compiler = which("cc") ?? which("gcc") ?? which("clang");
  if (compiler === undefined) {
    throw new Error(
      "no flock helper for the specs: neither AGENTS_FLOCK nor agents-flock is usable, and no C " +
        `compiler (cc, gcc, clang) is on PATH to build ${helperSource()}; install one or set ` +
        "AGENTS_FLOCK to a build of it",
    );
  }
  const directory = (lookup.makeDirectory ?? makeDirectory)();
  process.on("exit", () => {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      // A helper left in /tmp is a nuisance, not a failed suite.
    }
  });
  const target = join(directory, "agents-flock");
  try {
    (lookup.compile ?? compileHelper)(compiler, helperSource(), target);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot build ${helperSource()} with ${compiler}: ${detail}`);
  }
  return target;
}

let cached: string | undefined;

/** The helper every lock spec points `AGENTS_FLOCK` at. */
export function flockHelperForTests(): string {
  cached ??= resolveFlockHelper();
  return cached;
}
