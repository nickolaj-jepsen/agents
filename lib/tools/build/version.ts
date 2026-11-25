// A plugin's or skill's version, and what follows from it alone: how finished the unit is, and which
// of two versions is the newer. No imports, so the publish script runs it with plain node.

/** Semver 2.0.0, prerelease and build metadata included. */
export const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** The three numbers alone: the only shape a version may be published in. */
const PLAIN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const isSemver = (value: unknown): value is string =>
  typeof value === "string" && SEMVER.test(value);

/**
 * Whether a version is three numbers and nothing else. A suffixed one (`1.3.0-rc.1`) is semver, and
 * no release: there is one channel, and Claude Code hands every user any version that differs from
 * theirs.
 */
export const isPlain = (version: string): boolean => PLAIN.test(version);

/**
 * How finished a unit is, which its version alone says:
 *
 * - `unfinished`: 0.0.x. Listed last, under a notice that it is not ready for anyone else.
 * - `pre-release`: 0.1.0 and up, below 1.0.0. Usable, and free to change.
 * - `release`: 1.0.0 and up.
 */
export type Tier = "unfinished" | "pre-release" | "release";

export function tierOf(version: string): Tier {
  const { core, pre } = parts(version);
  if (core[0] === 0 && core[1] === 0) return "unfinished";
  return core[0] === 0 || pre !== undefined ? "pre-release" : "release";
}

/** What a GitHub Release is flagged as: everything below 1.0.0 is a pre-release there. */
export const isPrerelease = (version: string): boolean => tierOf(version) !== "release";

/** Semver precedence: core first, then prerelease per the spec. */
export function compareSemver(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i++) {
    const d = pa.core[i]! - pb.core[i]!;
    if (d !== 0) return d;
  }
  if (pa.pre === undefined && pb.pre === undefined) return 0;
  // A release is newer than any prerelease of the same core.
  if (pa.pre === undefined) return 1;
  if (pb.pre === undefined) return -1;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d;
    } else if (xn) return -1;
    else if (yn) return 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export type Level = "patch" | "minor" | "major";
export const LEVELS: readonly Level[] = ["patch", "minor", "major"];

/** The next version at a level: the three numbers, whatever suffix the old one carried. */
export function bump(version: string, level: Level): string {
  const [major, minor, patch] = parts(version).core as [number, number, number];
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function parts(version: string): { core: number[]; pre?: string[] } {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!m) return { core: [0, 0, 0] };
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    ...(m[4] === undefined ? {} : { pre: m[4].split(".") }),
  };
}
