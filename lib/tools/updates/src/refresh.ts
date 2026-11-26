/**
 * `agents-refresh`: turn the published state into what one agent profile actually loads.
 *
 * `agents update NAME` publishes a newer snapshot than the manifest a consumer pins into
 * `current.json`; nothing is ever linked from a checkout. Neither harness can be handed new plugin
 * paths by another process, so this runs where a launch or a session's own reload request can reach
 * it: a pi launcher, pi's bridge (through AGENTS_REFRESH), a claude launcher and home-manager's
 * activation. It reloads nothing itself — pi's bridge calls `ctx.reload()` afterwards, and claude
 * needs a restart.
 *
 * What it owns in a profile, and nothing else:
 *
 *   <profile>/settings.json    pi only: `skills`, the managed entries of `packages`, and
 *                              `piAgents.twinExtensions`. Third-party packages, `parent/`,
 *                              `${extensions}/core` and anything a user added are left alone. Twins
 *                              stay the pinned set: a published plugin is not promoted to a durable
 *                              agent's tool twin.
 *   <profile>/skills/          claude only: a view (one symlink per skill) of the effective skill
 *                              map, since Claude Code discovers skills in its config dir. It is per
 *                              profile, not per session: a publication only reaches a launch, and a
 *                              refresh rewrites the one view every session in that profile reads at
 *                              its next start.
 *
 * Env (set by the consumer's wrappers):
 *
 *   AGENTS_HARNESS               pi | claude
 *   AGENTS_PROFILE               the config root to manage (pi's agent dir, claude's config dir)
 *   AGENTS_BASELINE, AGENTS_CLI  the CLI's own env, passed straight through to `agents resolve`
 *   AGENTS_PLUGIN_ORDER          space separated plugin load order
 *   AGENTS_SKILL_EXTRAS          optional JSON file {name: path}: skills outside the registry
 *   AGENTS_CLAUDE_ENV            optional JSON file {"env": {...}} the launch settings start from
 *   AGENTS_CLAUDE_SETTINGS_DIR   where to keep the launch settings; the chosen path is printed
 *   AGENTS_CLAUDE_EXTRA_SETTINGS optional JSON object merged into those settings
 *   AGENTS_FLOCK                 the flock(2) helper; default: agents-flock on PATH
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { UpdatesError, describeError, isSystemError } from "./core/errors.ts";
import { jsonDocument, readJsonFile, writeJsonAtomic } from "./core/json.ts";
import {
  type Environment,
  agentsSkillsDir,
  profileLockPath,
  profileManifestPath,
  profileSettingsPath,
  profileSkillsDir,
} from "./core/paths.ts";
import {
  HARNESSES,
  STORE_ROOT,
  TWIN_KEY,
  type Baseline,
  type ProfileManifest,
  type Resolved,
  isObject,
  parseBaseline,
  parseResolved,
} from "./core/protocol.ts";
import { acquireFileLock } from "./lock.ts";

const PROG = "agents updates";
const SETTINGS_TTL_SECONDS = 7 * 24 * 3600;

export type RefreshConsole = {
  /** A line about what was done, on stderr, prefixed with the program's name. */
  say(message: string): void;
  /** The chosen launch settings path, on stdout. */
  out(text: string): void;
};

const defaultConsole: RefreshConsole = {
  say: (message) => process.stderr.write(`${PROG}: ${message}\n`),
  out: (text) => process.stdout.write(text),
};

export type RefreshDeps = {
  /** `agents resolve`, injectable so the specs do not need a CLI on PATH. */
  resolve?: (env: Environment) => Resolved;
  /** `fs.symlinkSync`, injectable so a spec can make the second link fail. */
  link?: (target: string, path: string) => void;
  console?: RefreshConsole;
};

export function writeJson(path: string, value: unknown, mode = 0o600): void {
  writeJsonAtomic(path, value, { mode, sync: false });
}

/** What both harnesses should load: `agents resolve`, the union of baseline and state. */
export function resolve(env: Environment): Resolved {
  const cli = env.AGENTS_CLI || "agents";
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(env))
    if (typeof value === "string") childEnv[key] = value;
  const result = spawnSync(cli, ["resolve"], {
    env: childEnv,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    throw new UpdatesError(`cannot run ${cli}: ${describeError(result.error)}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim() || `exit ${result.status}`;
    throw new UpdatesError(`${cli} resolve failed: ${detail}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    throw new UpdatesError(`${cli} resolve did not print JSON`);
  }
  return parseResolved(data, cli);
}

/**
 * Whether a previous generation wrote this entry: a link into the store (or a checkout), or a
 * directory holding nothing else — home-manager's per-file form of a skill directory.
 */
export function replaceable(entry: string, roots: readonly string[]): boolean {
  const stat = fs.lstatSync(entry, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) {
    const target = fs.readlinkSync(entry);
    return roots.some((root) => target.startsWith(root));
  }
  if (!stat?.isDirectory()) return false;
  return linksOnly(entry, roots);
}

function linksOnly(directory: string, roots: readonly string[]): boolean {
  for (const name of fs.readdirSync(directory)) {
    const child = join(directory, name);
    const stat = fs.lstatSync(child);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(child);
      if (!roots.some((root) => target.startsWith(root))) return false;
      continue;
    }
    if (stat.isDirectory()) {
      if (!linksOnly(child, roots)) return false;
      continue;
    }
    return false;
  }
  return true;
}

export type SyncOptions = {
  link?: (target: string, path: string) => void;
  say?: (message: string) => void;
};

/**
 * Point `<profile>/skills/<name>` at `desired` for the names this design manages.
 *
 * Claude Code discovers skills in this directory and also writes its own synced ones there, so the
 * directory stays a real directory and only the per-name entries are ours. An entry a previous
 * generation created (home-manager's directory-of-store-links form, or a link into a checkout) is
 * replaced; anything else is reported and left in place.
 */
export function syncSkills(
  profile: string,
  desired: Record<string, string>,
  previous: ReadonlySet<string>,
  roots: readonly string[],
  options: SyncOptions = {},
): number {
  const link = options.link ?? fs.symlinkSync;
  const say = options.say ?? defaultConsole.say;
  const directory = profileSkillsDir(profile);
  fs.mkdirSync(directory, { recursive: true });
  let changed = 0;
  for (const [name, target] of Object.entries(desired)) {
    const path = join(directory, name);
    try {
      const stat = fs.lstatSync(path, { throwIfNoEntry: false });
      if (stat === undefined) {
        link(target, path);
        changed += 1;
        continue;
      }
      if (stat.isSymbolicLink() && fs.readlinkSync(path) === target) continue;
      if (!replaceable(path, roots)) {
        say(`${path} was not written by this flake, so ${name} was left as it is`);
        continue;
      }
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        fs.rmSync(path, { recursive: true, force: true });
      } else {
        fs.unlinkSync(path);
      }
      link(target, path);
      changed += 1;
    } catch (error) {
      if (error instanceof UpdatesError) throw error;
      throw new UpdatesError(`cannot link ${path}: ${describeError(error)}`);
    }
  }
  for (const name of previous) {
    if (Object.hasOwn(desired, name)) continue;
    const path = join(directory, name);
    const stat = fs.lstatSync(path, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink() && roots.some((root) => fs.readlinkSync(path).startsWith(root))) {
      fs.unlinkSync(path);
      changed += 1;
    }
  }
  return changed;
}

/** path -> plugin name, for entries this design wrote: pinned paths and last published ones. */
export function managedPaths(
  baseline: Baseline,
  manifest: ProfileManifest,
  key: "packages" | "twins",
  variant: "pi" | "claude",
): Record<string, string> {
  const owned: Record<string, string> = {};
  for (const [name, entry] of Object.entries(baseline.plugins)) {
    const path = entry[variant];
    if (path) owned[path] = name;
  }
  for (const [name, path] of Object.entries(manifest[key] ?? {})) {
    if (path && !Object.hasOwn(owned, path)) owned[path] = name;
  }
  return owned;
}

/**
 * Replace every owned entry in place, dropping variants that no longer exist.
 *
 * A name that the list has never held is inserted after the last owned entry, so a new plugin lands
 * beside its siblings instead of after whatever ends the list.
 */
export function rewrite(
  entries: unknown,
  owned: Record<string, string>,
  picked: Record<string, string | undefined>,
  pinned: Record<string, string | undefined>,
  field: string,
): { entries: unknown[]; wrote: Record<string, string> } {
  if (!Array.isArray(entries)) throw new UpdatesError(`${field} is not a list`);
  const result: unknown[] = [];
  const seen = new Set<string>();
  let last: number | null = null;
  for (const entry of entries) {
    if (typeof entry !== "string") {
      result.push(entry);
      continue;
    }
    const name = Object.hasOwn(owned, entry) ? owned[entry] : undefined;
    if (name === undefined) {
      result.push(entry);
      continue;
    }
    const target =
      (Object.hasOwn(picked, name) ? picked[name] : undefined) ||
      (Object.hasOwn(pinned, name) ? pinned[name] : undefined);
    if (target === undefined) continue;
    result.push(target);
    seen.add(name);
    last = result.length - 1;
  }
  const fresh: string[] = [];
  for (const name of Object.keys(picked).sort()) {
    if (seen.has(name) || !picked[name]) continue;
    fresh.push(picked[name]!);
  }
  if (fresh.length > 0) {
    const at = last === null ? result.length : last + 1;
    result.splice(at, 0, ...fresh);
  }
  const wrote: Record<string, string> = {};
  for (const name of [...new Set([...seen, ...Object.keys(picked)])].sort()) {
    const target =
      (Object.hasOwn(picked, name) ? picked[name] : undefined) ||
      (Object.hasOwn(pinned, name) ? pinned[name] : undefined);
    if (target) wrote[name] = target;
  }
  return { entries: result, wrote };
}

/**
 * Point pi's skill resources at immutable store paths, in settings.json.
 *
 * `settings.skills` loads what it lists and filters what discovery found, so the resolved paths are
 * canonical for the session. The registry's own directory is excluded name by name instead of
 * dropping the whole directory: anything else in it, every project `.agents/skills` dir, and any
 * pattern someone added with `pi config` stays.
 */
export function syncPiSkills(
  settings: Record<string, unknown>,
  desired: Record<string, string>,
  baseline: Baseline,
  manifest: ProfileManifest,
  home: string,
): number {
  const registry = agentsSkillsDir(home);
  const names = new Set([...Object.keys(baseline.skills), ...Object.keys(desired)]);
  const excluded = [...names].sort().map((name) => `-${join(registry, name)}`);
  const managed = [
    ...Object.keys(desired)
      .sort()
      .map((name) => desired[name]!),
    ...excluded,
  ];

  const previous = new Set(Array.isArray(manifest.skills) ? manifest.skills : []);
  const current = Array.isArray(settings.skills) ? settings.skills : [];
  const kept = current.filter(
    (entry): entry is string =>
      typeof entry === "string" && !previous.has(entry) && !managed.includes(entry),
  );
  const merged = [...managed, ...kept];
  // Record what this design wrote, not what it merely left alone: a pattern added with `pi config`
  // must survive the next run, and a path of ours that a reset dropped must not.
  manifest.skills = managed;
  if (!sameJson(merged, settings.skills)) {
    settings.skills = merged;
    return 1;
  }
  return 0;
}

/**
 * Rewrite only the managed entries of one pi profile's settings.json.
 *
 * `manifest` is the caller's, mutated in place: it remembers which paths this design wrote, so a
 * path left behind by a `reset` is still recognised as ours and replaced.
 */
export function syncPiSettings(
  profile: string,
  resolved: Resolved,
  baseline: Baseline,
  manifest: ProfileManifest,
  home: string,
  desiredSkills: Record<string, string>,
): number {
  const settingsPath = profileSettingsPath(profile);
  if (!fs.existsSync(settingsPath)) return 0;
  const settings = readJsonFile(settingsPath);
  if (!isObject(settings)) throw new UpdatesError(`${settingsPath} does not hold a JSON object`);

  const picked: Record<string, string | undefined> = {};
  for (const [name, entry] of Object.entries(resolved.plugins))
    picked[name] = entry.pi ?? undefined;
  const pinned: Record<string, string | undefined> = {};
  for (const [name, entry] of Object.entries(baseline.plugins))
    pinned[name] = entry.pi ?? undefined;

  let changed = syncPiSkills(settings, desiredSkills, baseline, manifest, home);
  const owned = managedPaths(baseline, manifest, "packages", "pi");
  if ("packages" in settings) {
    const rewritten = rewrite(settings.packages, owned, picked, pinned, "packages");
    if (!sameJson(rewritten.entries, settings.packages)) {
      settings.packages = rewritten.entries;
      changed += 1;
    }
    manifest.packages = rewritten.wrote;
  }

  // Twins are a pinned choice, not something a publication extends: only the names already in the
  // array (or last written there) are refreshed, so a new plugin never becomes a twin.
  const agents = settings[TWIN_KEY];
  if (isObject(agents) && Array.isArray(agents.twinExtensions)) {
    const twinOwned = managedPaths(baseline, manifest, "twins", "pi");
    const current = agents.twinExtensions;
    const twinNames = new Set<string>();
    for (const entry of current) {
      if (typeof entry !== "string") continue;
      const name = Object.hasOwn(twinOwned, entry) ? twinOwned[entry] : undefined;
      if (name !== undefined) twinNames.add(name);
    }
    const pickedTwins: Record<string, string | undefined> = {};
    const pinnedTwins: Record<string, string | undefined> = {};
    for (const name of twinNames) {
      if (picked[name]) pickedTwins[name] = picked[name];
      if (pinned[name]) pinnedTwins[name] = pinned[name];
    }
    const twins = rewrite(current, twinOwned, pickedTwins, pinnedTwins, "twinExtensions");
    if (!sameJson(twins.entries, current)) {
      agents.twinExtensions = twins.entries;
      changed += 1;
    }
    manifest.twins = twins.wrote;
  }

  if (changed) writeJson(settingsPath, settings);
  return changed;
}

/**
 * The launch settings claude needs: the effective plugin dirs over the baseline env.
 *
 * The file is content-addressed, so concurrent launches never rewrite one another's file (claude
 * reads it once at startup) and an unchanged resolution stops making new ones.
 */
export function claudeSettings(env: Environment, resolved: Resolved): string | null {
  const directory = env.AGENTS_CLAUDE_SETTINGS_DIR;
  if (!directory) return null;
  let base: Record<string, unknown> = {};
  if (env.AGENTS_CLAUDE_ENV) {
    const loaded = readJsonFile(env.AGENTS_CLAUDE_ENV);
    if (isObject(loaded) && isObject(loaded.env)) base = { ...loaded.env };
  }
  const order = (env.AGENTS_PLUGIN_ORDER ?? "").split(/\s+/).filter(Boolean);
  const ordered = order.filter((name) => Object.hasOwn(resolved.plugins, name));
  const chosen = new Set(order);
  ordered.push(
    ...Object.keys(resolved.plugins)
      .sort()
      .filter((name) => !chosen.has(name)),
  );
  const dirs = ordered
    .map((name) => resolved.plugins[name]?.claude)
    .filter((path): path is string => Boolean(path));
  base.CLAUDE_CODE_PLUGIN_DIRS = dirs.join(":");
  const settings: Record<string, unknown> = { env: base };
  const extra = env.AGENTS_CLAUDE_EXTRA_SETTINGS;
  if (extra) {
    let loaded: unknown;
    try {
      loaded = JSON.parse(extra);
    } catch (error) {
      throw new UpdatesError(`AGENTS_CLAUDE_EXTRA_SETTINGS is not JSON: ${describeError(error)}`);
    }
    if (!isObject(loaded)) {
      throw new UpdatesError("AGENTS_CLAUDE_EXTRA_SETTINGS must hold a JSON object");
    }
    Object.assign(settings, loaded);
  }

  const body = jsonDocument(settings);
  const digest = createHash("sha256").update(body, "utf8").digest("hex").slice(0, 16);
  fs.mkdirSync(directory, { recursive: true });
  const path = join(directory, `${digest}.json`);
  if (!fs.existsSync(path)) {
    writeJson(path, settings);
    prune(directory, path);
  }
  return path;
}

/** Drop launch settings this profile has not resolved for a while; they are ~200 bytes. */
export function prune(directory: string, keep: string): void {
  const cutoff = Date.now() / 1000 - SETTINGS_TTL_SECONDS;
  for (const name of fs.readdirSync(directory)) {
    if (!name.endsWith(".json")) continue;
    const path = join(directory, name);
    if (path === keep) continue;
    try {
      if (fs.statSync(path).mtimeMs / 1000 < cutoff) fs.unlinkSync(path);
    } catch {
      // Another launch pruning at the same time is fine.
    }
  }
}

export async function run(env: Environment, deps: RefreshDeps = {}): Promise<number> {
  const console = deps.console ?? defaultConsole;
  const harness = env.AGENTS_HARNESS;
  if (harness !== "pi" && harness !== "claude") {
    throw new UpdatesError(
      `AGENTS_HARNESS must be one of ${HARNESSES.join(", ")}, not ${repr(harness)}`,
    );
  }
  const profile = env.AGENTS_PROFILE;
  if (!profile) throw new UpdatesError("AGENTS_PROFILE is not set");
  const baselinePath = env.AGENTS_BASELINE;
  if (!baselinePath) {
    throw new UpdatesError("AGENTS_BASELINE is not set, so there is nothing to resolve");
  }
  const baseline = parseBaseline(readJsonFile(baselinePath), baselinePath);

  const resolved = (deps.resolve ?? resolve)(env);

  const desired: Record<string, string> = {};
  for (const [name, path] of Object.entries(resolved.skills)) if (path) desired[name] = path;
  const extras = env.AGENTS_SKILL_EXTRAS;
  if (extras) {
    const loaded = readJsonFile(extras);
    if (isObject(loaded)) {
      for (const [name, path] of Object.entries(loaded)) {
        if (typeof path === "string" && path) desired[name] = path;
      }
    }
  }

  fs.mkdirSync(profile, { recursive: true });
  const home = env.HOME || homedir();
  const release = await acquireFileLock(profileLockPath(profile), { timeout: "forever", env });
  try {
    const manifestPath = profileManifestPath(profile);
    let manifest: ProfileManifest = {};
    if (fs.existsSync(manifestPath)) {
      const loaded = readJsonFile(manifestPath);
      manifest = isObject(loaded) ? (loaded as ProfileManifest) : {};
    }
    let rewritten = 0;
    let printed: string | null = null;
    let linked = 0;
    if (harness === "pi") {
      // pi loads skill paths from settings, so there is no directory view to keep and nothing
      // shared for a launch to rewrite under a running session.
      rewritten = syncPiSettings(profile, resolved, baseline, manifest, home, desired);
    } else {
      // Claude Code only discovers skills in its config dir, so this is a profile view.
      const previous = new Set(Array.isArray(manifest.skills) ? manifest.skills : []);
      // Journal names before touching links: if refresh fails part-way through, a later reset still
      // knows which newly created entries it must remove.
      manifest.skills = [...new Set([...previous, ...Object.keys(desired)])].sort();
      writeJson(manifestPath, manifest);
      const roots = env.AGENTS_CHECKOUT ? [STORE_ROOT, `${env.AGENTS_CHECKOUT}/`] : [STORE_ROOT];
      linked = syncSkills(profile, desired, previous, roots, { link: deps.link, say: console.say });
      manifest.skills = Object.keys(desired).sort();
      printed = claudeSettings(env, resolved);
    }
    writeJson(manifestPath, manifest);

    if (linked) console.say(`${Object.keys(desired).length} skills, ${linked} changed`);
    if (rewritten) console.say("settings.json refreshed");
    if (printed) console.out(`${printed}\n`);
    return 0;
  } finally {
    await release();
  }
}

/** The failure text a person reads, for a value they set wrongly. */
function repr(value: unknown): string {
  if (value === undefined) return "None";
  return JSON.stringify(value);
}

/** Values compared as JSON: the arrays this design rewrites hold strings only. */
function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function main(env: Environment = process.env): Promise<number> {
  try {
    return await run(env);
  } catch (error) {
    if (error instanceof UpdatesError) {
      defaultConsole.say(error.message);
      return 1;
    }
    if (isSystemError(error)) {
      defaultConsole.say(error.message);
      return 1;
    }
    throw error;
  }
}
