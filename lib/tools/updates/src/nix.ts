/**
 * The environment the wrapper Nix installs, and the one expression a publication builds.
 *
 * A build is the only backend: the snapshot is evaluated as a flake against the nixpkgs the wrapper
 * names, and one linkFarm holds every requested half (and, for a skill, the skills tree) so a single
 * `nix build --out-link` both builds and roots them. A linkFarm's references keep those outputs
 * alive for as long as the root exists.
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { UpdatesError, describeError } from "./core/errors.ts";
import { readJsonFile } from "./core/json.ts";
import type { Environment } from "./core/paths.ts";
import { HARNESSES, isObject } from "./core/protocol.ts";
import type { Harness } from "./core/protocol.ts";
import { repositoryPath } from "./snapshot.ts";

export type Context = {
  baselinePath: string;
  checkout: string;
  nixpkgs: string;
  claude: string;
  system: string;
  state: string;
  lockTimeout: number;
  environment: NodeJS.ProcessEnv;
};

/** The store directory: nixpkgs is a store path, so its parent is the store. */
export const storeOf = (context: Context): string => dirname(context.nixpkgs);

export type ChildEnvironment = NodeJS.ProcessEnv;

/** The environment subprocesses get: the ambient one plus this CLI's own settings. */
export function childEnvironment(env: Environment): ChildEnvironment {
  const merged: ChildEnvironment = { ...process.env };
  for (const [key, value] of Object.entries(env))
    if (typeof value === "string") merged[key] = value;
  return merged;
}

export function lockTimeout(env: Environment): number {
  const text = env.AGENTS_UPDATE_LOCK_TIMEOUT || "600";
  const value = Number(text);
  if (Number.isNaN(value)) throw new UpdatesError("AGENTS_UPDATE_LOCK_TIMEOUT is not a number");
  return value;
}

export function contextFromEnv(env: Environment, state: string): Context {
  const names = [
    "AGENTS_BASELINE",
    "AGENTS_CHECKOUT",
    "AGENTS_NIXPKGS",
    "AGENTS_CLAUDE",
    "AGENTS_SYSTEM",
  ] as const;
  const missing = names.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new UpdatesError(
      `${missing.join(", ")} not set: run me from the wrapper Nix installs, or set them by hand ` +
        "(see the module header)",
    );
  }
  return {
    baselinePath: env.AGENTS_BASELINE!,
    checkout: env.AGENTS_CHECKOUT!,
    nixpkgs: env.AGENTS_NIXPKGS!,
    claude: env.AGENTS_CLAUDE!,
    system: env.AGENTS_SYSTEM!,
    state,
    lockTimeout: lockTimeout(env),
    environment: childEnvironment(env),
  };
}

/** A Nix string literal. JSON escaping covers what our names and paths contain. */
export const nixString = (value: string): string => JSON.stringify(value);

const NIX_PATH_PATTERN = /^[A-Za-z0-9._/+-]+$/;

/** A Nix path literal; refuse anything a path literal cannot spell. */
export function nixPath(value: string): string {
  if (!NIX_PATH_PATTERN.test(value)) {
    throw new UpdatesError(`cannot spell ${JSON.stringify(value)} as a Nix path`);
  }
  return value;
}

export type PluginTarget = { name: string; variant: Harness };

/**
 * The linkFarm whose links are this generation's outputs.
 *
 * One derivation graphs every requested half plus the whole snapshot, so a single
 * `nix build --out-link` both builds and roots all of it.
 */
export function buildExpression(
  context: Context,
  snapshot: string,
  pluginTargets: readonly PluginTarget[],
  skills: readonly string[],
): string {
  const halves = pluginTargets.map((target) => target.variant);
  const lines = [
    "let",
    `  flake = builtins.getFlake ${nixString(`path:${snapshot}`)};`,
    `  system = ${nixString(context.system)};`,
    `  pkgs = import ${nixPath(context.nixpkgs)} { inherit system; config.allowUnfree = true; };`,
    "  plugins = flake.lib.pluginsFor pkgs;",
  ];
  if (halves.includes("claude")) {
    // mkClaudePlugin runs the supplied claude-code; the wrapper Nix installs injects
    // --plugin-dir and breaks `claude plugin validate`, so the package (not finalPackage) is the
    // right path.
    lines.push(`  claude-code = builtins.storePath ${nixPath(context.claude)};`);
    lines.push("  mkClaude = flake.lib.mkClaudePlugin { inherit pkgs claude-code; };");
  }
  lines.push("in", '  pkgs.linkFarm "agents-update-built" [');
  for (const { name, variant } of pluginTargets) {
    const target = `plugins/${name}/${variant}`;
    const source =
      variant === "claude" ? `mkClaude ${nixString(name)}` : `plugins.${nixString(name)}.path`;
    lines.push(`    { name = ${nixString(target)}; path = ${source}; }`);
  }
  if (skills.length > 0) {
    lines.push(
      '    { name = "skills"; path = builtins.path ' +
        `{ path = ${nixPath(snapshot)}; name = "agents-snapshot"; }; }`,
    );
  }
  lines.push("  ]");
  return `${lines.join("\n")}\n`;
}

/**
 * The timestamp sorts roots chronologically; the pid and a short token keep two updates in the same
 * second (or a retried one) from sharing a root directory.
 */
export function generationId(date: Date = new Date()): string {
  const stamp = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `${stamp}-${process.pid}-${randomUUID().replace(/-/g, "").slice(0, 4)}`;
}

/** The store path a linkFarm entry points at; anything else is a broken build. */
export function storeLink(path: string, store: string): string {
  let target: string;
  try {
    target = fs.readlinkSync(path);
  } catch {
    throw new UpdatesError(`the build left no output at ${path}`);
  }
  const prefix = store.replace(/\/+$/, "") + "/";
  if (!target.startsWith(prefix)) {
    throw new UpdatesError(`${path} points at ${target}, which is not in ${store}`);
  }
  return target;
}

export type BuildResult = {
  /** Keyed `${name}\0${variant}`, so two variants of one plugin cannot collide. */
  built: Map<string, { name: string; variant: Harness; path: string }>;
  skillsStore: string | null;
};

/** Build this generation and root it, with the whole build log on failure. */
export function nixBuild(
  context: Context,
  snapshot: string,
  pluginTargets: readonly PluginTarget[],
  skills: readonly string[],
  generation: string,
  log: (text: string) => void,
): BuildResult {
  const expression = buildExpression(context, snapshot, pluginTargets, skills);
  fs.mkdirSync(generation, { recursive: true });
  const link = join(generation, "build");
  const command = [
    "build",
    "--impure",
    "--out-link",
    link,
    "--expr",
    expression,
    "--extra-experimental-features",
    "nix-command flakes",
  ];
  const result = spawnSync("nix", command, {
    env: context.environment,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new UpdatesError("nix is not installed");
    }
    throw new UpdatesError(`cannot run nix: ${describeError(result.error)}`);
  }
  if (result.status !== 0) {
    // The whole build log, so a pnpm or claude failure is visible here rather than in a log.
    for (const stream of [result.stderr ?? "", result.stdout ?? ""]) {
      if (stream.trim()) log(stream.endsWith("\n") ? stream : `${stream}\n`);
    }
    throw new UpdatesError("the snapshot build failed; the state in current.json is unchanged");
  }

  const store = storeOf(context);
  const built: BuildResult["built"] = new Map();
  for (const { name, variant } of pluginTargets) {
    const path = storeLink(join(link, "plugins", name, variant), store);
    built.set(`${name}\0${variant}`, { name, variant, path });
  }
  const skillsStore = skills.length > 0 ? storeLink(join(link, "skills"), store) : null;
  if (skillsStore !== null) {
    const missing = skills.filter(
      (name) =>
        !fs.statSync(join(skillsStore, "skills", name), { throwIfNoEntry: false })?.isDirectory(),
    );
    if (missing.length > 0) {
      throw new UpdatesError(`the skills snapshot ${skillsStore} lacks ${missing.join(", ")}`);
    }
  }
  return { built, skillsStore };
}

/** Whether the checkout's package.json declares each half; null when it is no plugin at all. */
export function pluginHalves(snapshotRoot: string, name: string): Harness[] | null {
  const manifest = repositoryPath(snapshotRoot, "apps", name, "package.json");
  const stat = fs.statSync(manifest, { throwIfNoEntry: false });
  if (!stat?.isFile()) return null;
  const packageJson = readJsonFile(manifest);
  if (!isObject(packageJson)) throw new UpdatesError(`${manifest} must hold a JSON object`);
  return HARNESSES.filter((harness) => Object.hasOwn(packageJson, harness));
}

export type UpdatePlan = {
  /** The halves to build, in the order the names were given. */
  pluginTargets: PluginTarget[];
  /** The skills to publish (the whole tree is snapshotted either way). */
  skills: string[];
  /** The halves the checkout offers per plugin, which decides what a variant should become. */
  supported: Record<string, Harness[]>;
};

/** What `update` will build, and what the checkout offers per plugin. */
export function planUpdate(
  snapshotRoot: string,
  names: readonly string[],
  skills: boolean,
  harness: Harness | undefined,
): UpdatePlan {
  const pluginTargets: PluginTarget[] = [];
  const selectedSkills: string[] = [];
  const supported: Record<string, Harness[]> = {};
  if (skills) {
    for (const name of names) {
      const directory = repositoryPath(snapshotRoot, "skills", name);
      if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
        throw new UpdatesError(`${name} is not a skill in the checkout: no skills/${name}`);
      }
      selectedSkills.push(name);
    }
    return { pluginTargets, skills: selectedSkills, supported };
  }

  for (const name of names) {
    const halves = pluginHalves(snapshotRoot, name);
    if (halves === null) {
      throw new UpdatesError(
        `${name} is not a plugin in the checkout: no apps/${name}/package.json`,
      );
    }
    if (halves.length === 0) {
      throw new UpdatesError(`${name} declares neither a claude nor a pi half in its package.json`);
    }
    let chosen: Harness[];
    if (harness !== undefined) {
      if (!halves.includes(harness)) {
        throw new UpdatesError(
          `${name} has no ${harness} half in the checkout (it has ${halves.join(" and ")})`,
        );
      }
      chosen = [harness];
    } else {
      chosen = halves;
    }
    supported[name] = halves;
    for (const variant of chosen) pluginTargets.push({ name, variant });
  }
  return { pluginTargets, skills: selectedSkills, supported };
}
