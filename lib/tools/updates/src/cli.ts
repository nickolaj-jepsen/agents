/**
 * `agents`: publish the checkout's plugins and skills as immutable store snapshots.
 *
 * `agents update NAME` copies the checkout's working tree (tracked files plus untracked files that
 * git does not ignore) into a temporary directory, builds the requested plugin halves and the skills
 * tree from that snapshot with Nix, keeps a GC root for the result, and only then replaces
 * `$XDG_STATE_HOME/agents-updates/current.json` in one atomic rename. The checkout itself is never
 * written to: git is asked what its working tree holds, and nothing is pulled, committed, stashed or
 * switched.
 *
 * A launched harness asks `agents resolve` for the effective plugin and skill paths, which merges
 * those overrides over the baseline that Nix pins (`AGENTS_BASELINE`). A variant that current.json
 * does not override falls back to the baseline, so a partial update is safe.
 *
 * Generation roots are never removed. A running session may still load an older snapshot (Claude
 * Code resolves plugin paths at launch, pi sessions hold them in memory), so only a human can tell
 * when an old root is dead weight.
 *
 * Environment (set by the Nix wrapper):
 *   AGENTS_BASELINE  JSON file: {"revision": str,
 *                                "plugins": {name: {"pi": path|null, "claude": path|null}},
 *                                "skills": {name: path}}
 *   AGENTS_CHECKOUT  the agents checkout
 *   AGENTS_NIXPKGS   nixpkgs source store path
 *   AGENTS_CLAUDE    the claude-code package store path (unwrapped: mkClaudePlugin runs
 *                    `claude plugin validate`, which a wrapper's injected --plugin-dir breaks)
 *   AGENTS_SYSTEM    e.g. x86_64-linux
 * Optional:
 *   XDG_STATE_HOME              default ~/.local/state
 *   AGENTS_UPDATE_LOCK_TIMEOUT  seconds to wait for a concurrent update (default 600)
 *   AGENTS_UPDATE_KEEP_SNAPSHOT=1  keep the temporary snapshot even on success
 *   AGENTS_FLOCK                the flock(2) helper; default: agents-flock on PATH
 */
import fs from "node:fs";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { UpdatesError, isSystemError } from "./core/errors.ts";
import { jsonLine } from "./core/json.ts";
import { type Environment, stateDir, stateLockPath } from "./core/paths.ts";
import {
  HARNESSES,
  LIVE_CHOICES,
  ROOTS_DIR,
  STATE_FILE,
  type Baseline,
  type Harness,
  type LiveChoice,
  type PluginState,
  type SkillState,
  type State,
  type UiState,
  shortRevision,
  validateNames,
} from "./core/protocol.ts";
import { effective, loadBaseline, loadState, saveState } from "./core/selection.ts";
import { InterruptError, settleAndThrowIfInterrupted, throwIfInterrupted } from "./interrupt.ts";
import { withFileLock } from "./lock.ts";
import { loadSessions, runLive } from "./live.ts";
import {
  type BuildResult,
  type Context,
  type PluginTarget,
  type UpdatePlan,
  contextFromEnv,
  generationId,
  lockTimeout,
  nixBuild,
  planUpdate,
} from "./nix.ts";
import { type Snapshot, publishSnapshot } from "./snapshot.ts";
import {
  type DeployConsole,
  type DeployResult,
  deploy as deployArtifact,
  destination as uiDestination,
} from "./ui.ts";

const PROG = "agents";

/** Somewhere to write: the entry points hand in the process's streams, the specs a string sink. */
export type Output = { write(text: string): unknown; flush?: () => void };

export class Console {
  private readonly out: Output;
  private readonly err: Output;

  constructor(out: Output = process.stdout, err: Output = process.stderr) {
    this.out = out;
    this.err = err;
  }

  say(message = ""): void {
    this.out.write(`${message}\n`);
  }

  warn(message: string): void {
    this.err.write(`${message}\n`);
  }

  /** A build log: raw, exactly as the child wrote it. */
  stderr(text: string): void {
    this.err.write(text);
  }

  /** A resolver's JSON: one document, then a flush so a launcher never waits on it. */
  stdout(text: string): void {
    this.out.write(text);
    this.out.flush?.();
  }
}

export type UpdateArgs = {
  names: string[];
  skill: boolean;
  harness?: Harness;
  live?: LiveChoice;
  dryRun: boolean;
};

export type ResetArgs = { names: string[]; skill: boolean; harness?: Harness };

// ---------------------------------------------------------------------------------------------
// Commands

export async function cmdUpdate(
  args: UpdateArgs,
  env: Environment,
  console: Console,
): Promise<number> {
  validateNames(args.names);
  if (args.skill && args.harness) {
    throw new UpdatesError("--harness filters plugin variants; skills have none");
  }
  // Repeat a name and the linkFarm would get two entries called the same thing.
  const names = [...new Set(args.names)];
  const context = contextFromEnv(env, stateDir(env));
  const baseline = loadBaseline(context.baselinePath);

  let snapshot: Snapshot | undefined;
  let generation: string | undefined;
  let built: BuildResult["built"] = new Map();
  let skillsStore: string | null = null;
  let uiBuilt: Record<string, string> = {};
  let deployed: [string, DeployResult][] = [];
  let plan: UpdatePlan = { pluginTargets: [], skills: [], supported: {}, uiNames: [] };

  const published = await withStateLock(context, env, console, async () => {
    await settleAndThrowIfInterrupted();
    let state: State = loadState(context.state);
    const temporary = fs.mkdtempSync(join(tempDirectory(context.environment), `${PROG}-update-`));
    let keep = Boolean(env.AGENTS_UPDATE_KEEP_SNAPSHOT);
    try {
      snapshot = publishSnapshot(
        context.checkout,
        join(temporary, "agents-snapshot"),
        context.environment,
      );
      await settleAndThrowIfInterrupted();
      for (const path of snapshot.skipped.slice(0, 5)) {
        console.warn(`${PROG}: left out of the snapshot (submodule or deleted): ${path}`);
      }
      plan = planUpdate(snapshot.root, names, args.skill, args.harness);

      if (args.dryRun) {
        console.say(
          `dry run: ${describePlan(plan)} from ${shortRevision(snapshot.revision)} ` +
            `(${describeTree(snapshot)})`,
        );
        for (const name of plan.uiNames) {
          console.say(`dry run: ${name} would deploy into ${uiDestination(name, env)}`);
        }
        console.say("dry run: nothing built, deployed or recorded");
        return false;
      }

      generation = join(context.state, ROOTS_DIR, generationId());
      try {
        const result = nixBuild(
          context,
          snapshot.root,
          plan.pluginTargets,
          plan.skills,
          generation,
          (text) => console.stderr(text),
          plan.uiNames,
        );
        built = result.built;
        skillsStore = result.skillsStore;
        uiBuilt = result.uiBuilt;
      } catch (error) {
        // Keep the published tree so a failed pnpm or claude run can be inspected. An interrupt is
        // Python's KeyboardInterrupt, which removed its snapshot and reported the interruption.
        if (error instanceof UpdatesError) keep = true;
        throw error;
      }

      await settleAndThrowIfInterrupted();
      state = {
        plugins: applyPlugins(
          state.plugins,
          baseline.revision,
          plan.pluginTargets,
          plan.supported,
          built,
          args.harness,
        ),
        skills: applySkills(state.skills, baseline.revision, plan.skills, skillsStore ?? ""),
        ui: applyUi(state.ui, baseline.revision, uiBuilt),
      };
      await settleAndThrowIfInterrupted();
      // The state file first, the deployed tree second. A failure to deploy is undone by putting
      // the state file back: publishing before the tree is in place would leave `resolve` naming
      // an artifact the app is not reading.
      const previousState = stateBytes(context.state);
      saveState(context.state, state.plugins, state.skills, state.ui);
      if (Object.keys(uiBuilt).length > 0) {
        try {
          deployed = deployUi(
            context.state,
            env,
            console,
            Object.fromEntries(
              Object.entries(uiBuilt).map(([name, path]) => [name, { path, label: "published" }]),
            ),
          );
        } catch (error) {
          try {
            restoreState(context.state, previousState);
          } catch (restoreError) {
            console.warn(
              `${PROG}: could not put ${STATE_FILE} back after a failed deploy: ${expectedMessage(restoreError)}`,
            );
          }
          throw error;
        }
      }
      return true;
    } finally {
      if (keep) {
        console.warn(`${PROG}: kept the published snapshot in ${temporary}`);
      } else {
        try {
          fs.rmSync(temporary, { recursive: true, force: true });
        } catch {
          // A snapshot left behind is a nuisance, not a failed publication.
        }
      }
    }
  });
  if (!published) return 0;

  const finished = snapshot!;
  console.say(
    `published ${describePlan(plan)} from ${shortRevision(finished.revision)} ` +
      `(${describeTree(finished)})`,
  );
  for (const entry of [...built.values()].sort(byNameThenVariant)) {
    console.say(`  ${entry.name} ${entry.variant}: ${entry.path}`);
  }
  for (const name of [...plan.skills].sort()) {
    console.say(`  ${name} skill: ${join(skillsStore!, "skills", name)}`);
  }
  for (const name of Object.keys(uiBuilt).sort()) {
    console.say(`  ${name} ui: ${uiBuilt[name]}`);
  }
  console.say(
    `state: ${join(context.state, STATE_FILE)} (baseline ${shortRevision(baseline.revision)})`,
  );
  console.say(`root: ${join(generation!, "build")} (kept; older roots stay for running sessions)`);

  reportDeployed(console, deployed);

  if (args.live) {
    throwIfInterrupted();
    if (plan.uiNames.length > 0) {
      console.say(
        `live ${[...plan.uiNames].sort().join(", ")}: no reload request; Herdr watches the ` +
          "deployed files and reloads them itself",
      );
    }
    if (plan.pluginTargets.length > 0 || plan.skills.length > 0) {
      const harnesses: readonly string[] = args.live === "all" ? HARNESSES : [args.live];
      runLive(context.state, harnesses, console);
    }
  }
  return 0;
}

function byNameThenVariant(
  left: { name: string; variant: Harness },
  right: { name: string; variant: Harness },
): number {
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  return left.variant < right.variant ? -1 : left.variant > right.variant ? 1 : 0;
}

export function describePlan(plan: UpdatePlan): string {
  const parts = plan.pluginTargets.map(({ name, variant }) => `${name} ${variant}`);
  if (plan.skills.length > 0) parts.push(`skills ${[...plan.skills].sort().join(", ")}`);
  for (const name of plan.uiNames) parts.push(`${name} ui`);
  return parts.length > 0 ? parts.join(", ") : "nothing";
}

export function describeTree(snapshot: Snapshot): string {
  const dirty = snapshot.dirty
    ? `${snapshot.dirty} changed path${snapshot.dirty === 1 ? "" : "s"}`
    : "clean";
  return `${snapshot.files} files, ${dirty}`;
}

/** Merge this build into the state; a variant that only inherits the baseline stays null. */
export function applyPlugins(
  plugins: Record<string, PluginState>,
  revision: string,
  targets: readonly PluginTarget[],
  supported: Record<string, Harness[]>,
  built: BuildResult["built"],
  harness: Harness | undefined,
): Record<string, PluginState> {
  const updated: Record<string, PluginState> = {};
  for (const [name, entry] of Object.entries(plugins)) updated[name] = { ...entry };
  for (const name of new Set(targets.map((target) => target.name))) {
    const previous = updated[name] ?? ({} as PluginState);
    const entry = {} as PluginState;
    for (const variant of HARNESSES) {
      let value = previous[variant] ?? null;
      const builtEntry = built.get(`${name}\0${variant}`);
      if (builtEntry !== undefined) {
        value = builtEntry.path;
      } else if (
        (harness === undefined || harness === variant) &&
        !(supported[name] ?? []).includes(variant)
      ) {
        // The checkout no longer offers this half: stop overriding the baseline.
        value = null;
      }
      entry[variant] = value;
    }
    // A filtered update rewrote one half only, so restamping the entry would claim the untouched
    // half came from this baseline too and `check` would stop warning about it. Leave the pin alone
    // while the other half still holds an override.
    const untouchedOverride =
      harness !== undefined &&
      updated[name] !== undefined &&
      HARNESSES.some((variant) => variant !== harness && Boolean(previous[variant]));
    entry.baseline = untouchedOverride ? previous.baseline || revision : revision;
    updated[name] = entry;
  }
  return updated;
}

export function applySkills(
  skills: Record<string, SkillState>,
  revision: string,
  selected: readonly string[],
  skillsStore: string,
): Record<string, SkillState> {
  const updated: Record<string, SkillState> = {};
  for (const [name, entry] of Object.entries(skills)) updated[name] = { ...entry };
  for (const name of selected) {
    updated[name] = { path: join(skillsStore, "skills", name), baseline: revision };
  }
  return updated;
}

export async function cmdReset(
  args: ResetArgs,
  env: Environment,
  console: Console,
): Promise<number> {
  validateNames(args.names);
  if (args.skill && args.harness) {
    throw new UpdatesError("--harness filters plugin variants; skills have none");
  }
  const state = stateDir(env);
  const names = [...new Set(args.names)];
  let resetDeployed: [string, DeployResult][] = [];
  fs.mkdirSync(state, { recursive: true });
  await withFileLock(
    stateLockPath(state),
    {
      timeout: lockTimeout(env),
      env,
      onWait: (path) => console.warn(`${PROG}: waiting for another update to finish (${path})`),
    },
    async () => {
      await settleAndThrowIfInterrupted();
      const loaded = loadState(state);
      const plugins = loaded.plugins;
      const skills = loaded.skills;
      const ui = loaded.ui;
      const changed: string[] = [];
      if (args.skill) {
        for (const name of names) {
          if (Object.hasOwn(skills, name)) {
            delete skills[name];
            changed.push(`${name} (skill)`);
          }
        }
      } else {
        for (const name of names) {
          if (!Object.hasOwn(plugins, name)) continue;
          const entry = plugins[name]!;
          if (args.harness === undefined) {
            delete plugins[name];
            changed.push(name);
          } else if (entry[args.harness]) {
            entry[args.harness] = null;
            if (!HARNESSES.some((variant) => entry[variant])) delete plugins[name];
            changed.push(`${name} (${args.harness})`);
          }
        }
      }
      // A UI artifact is deployed, not linked: dropping the override is only the first half, so
      // the writable tree is converged on the baseline as part of the reset.
      const sources: Record<string, { path: string; label: string }> = {};
      if (!args.skill) {
        for (const name of names) {
          if (!Object.hasOwn(ui, name)) continue;
          if (args.harness !== undefined) {
            throw new UpdatesError(
              `--harness filters plugin halves; ${name} is a Herdr UI artifact`,
            );
          }
          delete ui[name];
          changed.push(`${name} (ui)`);
          const source = resetUiSource(env, name, console);
          if (source !== null) sources[name] = source;
        }
      }

      // Same order as an update, for the same reason: the state file is one atomic write, and a
      // deploy that fails is undone by putting it back.
      const previousState = stateBytes(state);
      if (changed.length > 0) {
        await settleAndThrowIfInterrupted();
        saveState(state, plugins, skills, ui);
        console.say(`reset to the baseline: ${changed.join(", ")}`);
      } else {
        console.say("nothing to reset: no snapshot for those names");
      }
      if (Object.keys(sources).length > 0) {
        try {
          resetDeployed = deployUi(state, env, console, sources);
        } catch (error) {
          try {
            restoreState(state, previousState);
          } catch (restoreError) {
            console.warn(
              `${PROG}: could not put ${STATE_FILE} back after a failed deploy: ${expectedMessage(restoreError)}`,
            );
          }
          throw error;
        }
      }
    },
  );
  reportDeployed(console, resetDeployed);
  return 0;
}

export function cmdStatus(env: Environment, console: Console): number {
  throwIfInterrupted();
  const state = stateDir(env);
  console.say(`${PROG} updates: ${state}`);
  let baseline: Baseline | undefined;
  const baselinePath = env.AGENTS_BASELINE;
  if (baselinePath) {
    try {
      baseline = loadBaseline(baselinePath);
    } catch (error) {
      console.warn(`${PROG}: ${expectedMessage(error)}`);
    }
  }
  console.say(
    `baseline: ${baseline ? shortRevision(baseline.revision) : "unknown (AGENTS_BASELINE not set)"}`,
  );

  let loaded: State = { plugins: {}, skills: {}, ui: {} };
  try {
    loaded = loadState(state);
  } catch (error) {
    console.warn(`${PROG}: ${expectedMessage(error)}`);
  }

  const pluginNames = Object.keys(loaded.plugins).sort();
  console.say(`plugins (${pluginNames.length}):`);
  for (const name of pluginNames) {
    const entry = loaded.plugins[name]!;
    const parts = HARNESSES.map((variant) => `${variant} ${entry[variant] || "baseline"}`);
    console.say(`  ${name}: ${parts.join(", ")} (pinned ${shortRevision(entry.baseline)})`);
  }
  if (pluginNames.length === 0) console.say("  none");

  const skillNames = Object.keys(loaded.skills).sort();
  console.say(`skills (${skillNames.length}):`);
  for (const name of skillNames) {
    const entry = loaded.skills[name]!;
    console.say(`  ${name}: ${entry.path} (pinned ${shortRevision(entry.baseline)})`);
  }
  if (skillNames.length === 0) console.say("  none");

  const uiNames = [
    ...new Set([...Object.keys(loaded.ui), ...Object.keys(baseline?.ui ?? {})]),
  ].sort();
  console.say(`ui (${uiNames.length}):`);
  for (const name of uiNames) {
    const entry = loaded.ui[name];
    if (entry?.path) {
      console.say(`  ${name}: ${entry.path} (pinned ${shortRevision(entry.baseline)})`);
    } else {
      const pinned = baseline && Object.hasOwn(baseline.ui, name) ? baseline.ui[name] : undefined;
      console.say(`  ${name}: baseline ${pinned || "unknown"}`);
    }
  }
  if (uiNames.length === 0) console.say("  none");

  const sessions = loadSessions(state);
  if (sessions.length > 0) {
    console.say(`sessions (${sessions.length}):`);
    for (const session of sessions) console.say(`  ${session.describe()}`);
  }
  return 0;
}

/** Non-blocking drift report: one line per problem, nothing when all is well, always 0. */
export function cmdCheck(env: Environment, console: Console): number {
  throwIfInterrupted();
  const state = stateDir(env);
  const problems: string[] = [];
  let loaded: State = { plugins: {}, skills: {}, ui: {} };
  try {
    loaded = loadState(state);
  } catch (error) {
    problems.push(expectedMessage(error));
  }

  let baseline: Baseline | undefined;
  const baselinePath = env.AGENTS_BASELINE;
  if (!baselinePath) {
    problems.push(
      "AGENTS_BASELINE is not set, so published snapshots cannot be compared with the pin",
    );
  } else {
    try {
      baseline = loadBaseline(baselinePath);
    } catch (error) {
      problems.push(expectedMessage(error));
    }
  }

  for (const name of Object.keys(loaded.plugins).sort()) {
    const entry = loaded.plugins[name]!;
    const pinned = entry.baseline || "";
    if (baseline !== undefined && pinned !== baseline.revision) {
      problems.push(
        `${name} was published from ${shortRevision(pinned)}, the pinned baseline is ` +
          `${shortRevision(baseline.revision)}; run \`${PROG} update ${name}\``,
      );
    }
    for (const variant of HARNESSES) {
      const path = entry[variant];
      if (path && !fs.existsSync(path)) {
        problems.push(
          `the ${variant} snapshot for ${name} is gone from the store; ` +
            `run \`${PROG} update ${name}\``,
        );
      }
    }
  }
  for (const name of Object.keys(loaded.skills).sort()) {
    const entry = loaded.skills[name]!;
    const pinned = entry.baseline || "";
    if (baseline !== undefined && pinned !== baseline.revision) {
      problems.push(
        `the ${name} skill was published from ${shortRevision(pinned)}, the pinned baseline is ` +
          `${shortRevision(baseline.revision)}; run \`${PROG} update ${name} --skill\``,
      );
    }
    if (!fs.existsSync(entry.path)) {
      problems.push(
        `the ${name} skill snapshot is gone from the store; ` +
          `run \`${PROG} update ${name} --skill\``,
      );
    }
  }

  for (const name of Object.keys(loaded.ui).sort()) {
    const entry = loaded.ui[name]!;
    const pinned = entry.baseline || "";
    if (baseline !== undefined && pinned !== baseline.revision) {
      problems.push(
        `${name} was published from ${shortRevision(pinned)}, the pinned baseline is ` +
          `${shortRevision(baseline.revision)}; run \`${PROG} update ${name}\``,
      );
    }
    if (!fs.statSync(entry.path, { throwIfNoEntry: false })?.isDirectory()) {
      problems.push(
        `the ${name} UI artifact is gone from the store; run \`${PROG} update ${name}\``,
      );
    }
  }

  for (const session of loadSessions(state)) {
    // Only a session that is still running can act on this: a dead session's failed ack (or a
    // request the bridge rejected while it was alive) would otherwise warn forever.
    if (session.process !== "alive") continue;
    const ack = session.ack();
    if (ack?.status === "failed") {
      const message = typeof ack.message === "string" && ack.message ? ack.message : "no message";
      problems.push(`session ${session.sessionId}'s last reload failed: ${message}`);
    }
  }

  for (const problem of problems) console.say(`${PROG} updates: ${problem}`);
  return 0;
}

export function cmdResolve(env: Environment, console: Console): number {
  throwIfInterrupted();
  const baselinePath = env.AGENTS_BASELINE;
  if (!baselinePath) {
    throw new UpdatesError("AGENTS_BASELINE is not set, so there is nothing to resolve");
  }
  const baseline = loadBaseline(baselinePath);
  let loaded: State = { plugins: {}, skills: {}, ui: {} };
  try {
    loaded = loadState(stateDir(env));
  } catch (error) {
    // A launch must not fail over a corrupt state file; the pinned baseline still loads.
    console.warn(`${PROG}: ${expectedMessage(error)}; resolving the baseline only`);
  }
  console.stdout(jsonLine(effective(baseline, loaded.plugins, loaded.skills, loaded.ui)));
  return 0;
}

/** `current.json` as it is now, or null when there is no state to put back. */
export function stateBytes(state: string): Buffer | null {
  try {
    return fs.readFileSync(join(state, STATE_FILE));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Put `previous` (from `stateBytes`) back, or drop the file when there was none.
 *
 * Used when an operation fails after it has written the state: a publication is only real if what
 * the tree reads and what `resolve` reports agree, so a half-done operation puts the state file
 * back the way it was rather than leaving the two disagreeing.
 */
export function restoreState(state: string, previous: Buffer | null): void {
  const path = join(state, STATE_FILE);
  if (previous === null) {
    try {
      fs.unlinkSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return;
  }
  fs.mkdirSync(state, { recursive: true });
  const temporary = join(state, `.${STATE_FILE}.${randomUUID().slice(0, 8)}`);
  try {
    const descriptor = fs.openSync(
      temporary,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      0o600,
    );
    try {
      fs.writeFileSync(descriptor, previous);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, path);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch {
      // The failure may have happened before the temporary existed.
    }
    throw error;
  }
}

/** Record this build's UI artifacts, stamped with the baseline they were published from. */
export function applyUi(
  ui: Record<string, UiState>,
  revision: string,
  built: Record<string, string>,
): Record<string, UiState> {
  const updated: Record<string, UiState> = {};
  for (const [name, entry] of Object.entries(ui)) updated[name] = { ...entry };
  for (const [name, path] of Object.entries(built)) {
    updated[name] = { path, baseline: revision };
  }
  return updated;
}

/**
 * The path to deploy for `name`: the published snapshot, or the pinned baseline. A published
 * snapshot that left the store (someone deleted its GC root by hand) must not fail an activation:
 * the pinned artifact is in the store by construction, and `check` reports the missing snapshot.
 */
export function effectiveUiSource(
  baseline: Baseline,
  ui: Record<string, UiState>,
  name: string,
  console: Console,
): { path: string; label: string } {
  const override = Object.hasOwn(ui, name) ? ui[name]!.path : undefined;
  const pinned = Object.hasOwn(baseline.ui, name) ? baseline.ui[name] : undefined;
  if (override) {
    if (fs.statSync(override, { throwIfNoEntry: false })?.isDirectory()) {
      return { path: override, label: "published" };
    }
    console.warn(
      `${PROG}: the published ${name} artifact ${override} is gone from the store; ` +
        `deploying the pinned baseline instead (run \`${PROG} update ${name}\` to republish it)`,
    );
    if (pinned && fs.statSync(pinned, { throwIfNoEntry: false })?.isDirectory()) {
      return { path: pinned, label: "baseline" };
    }
    throw new UpdatesError(
      `neither the published nor the pinned ${name} artifact exists; run \`${PROG} update ${name}\``,
    );
  }
  if (pinned) {
    if (!fs.statSync(pinned, { throwIfNoEntry: false })?.isDirectory()) {
      throw new UpdatesError(`the pinned ${name} artifact ${pinned} does not exist`);
    }
    return { path: pinned, label: "baseline" };
  }
  throw new UpdatesError(
    `${name} is in neither the baseline nor the published state, so there is nothing to deploy; ` +
      `add it to the baseline's \`ui\` map, or publish it with \`${PROG} update ${name}\``,
  );
}

/**
 * Deploy each artifact into its writable directory. Every caller that changes what Herdr should
 * load goes through here, so an explicit update and an activation converge on the same tree, and
 * only the files that differ are written.
 */
export function deployUi(
  state: string,
  env: Environment,
  console: Console,
  sources: Record<string, { path: string; label: string }>,
  dryRun = false,
): [string, DeployResult][] {
  const names = Object.keys(sources).sort();
  if (names.length > 1 && env.AGENTS_UI_DIR) {
    throw new UpdatesError(
      `AGENTS_UI_DIR names one directory, so it cannot deploy ${names.length} artifacts at once`,
    );
  }
  const results: [string, DeployResult][] = [];
  for (const name of names) {
    const entry = sources[name]!;
    const result = deployArtifact(
      name,
      entry.path,
      uiDestination(name, env),
      state,
      console as DeployConsole,
      dryRun,
    );
    results.push([entry.label, result]);
    for (const [relative, reason] of result.skipped) {
      console.warn(`${PROG}: ${name}: left ${relative} alone: ${reason}`);
    }
  }
  return results;
}

/**
 * Say what a deploy wrote, and say nothing about whether the app reloaded it. Herdr watches the
 * deployed files and reloads them itself, so there is no request to send and no ack to read.
 */
export function reportDeployed(console: Console, results: readonly [string, DeployResult][]): void {
  for (const [label, result] of results) {
    if (result.dryRun) {
      console.say(
        `dry run: ${result.name} would write ${result.written.length}, leave ` +
          `${result.unchanged} and prune ${result.pruned.length} in ${result.destination} ` +
          `(from ${result.source}, ${label})`,
      );
      for (const relative of result.written) console.say(`  would write ${relative}`);
      for (const relative of result.pruned) console.say(`  would prune ${relative}`);
      continue;
    }
    console.say(
      `${result.name}: deployed ${result.written.length} written, ${result.unchanged} unchanged, ` +
        `${result.pruned.length} pruned in ${result.destination} (from ${result.source}, ${label})`,
    );
    if (result.changed) {
      console.say(
        `${result.name}: no restart; Herdr watches these files and reloads what it sees, and ` +
          "these writes prove the tree, not that a running app applied it",
      );
    }
  }
}

/** The baseline's artifact for `name`, or nothing to deploy now, with the reason said out loud. */
export function resetUiSource(
  env: Environment,
  name: string,
  console: Console,
): { path: string; label: string } | null {
  const baselinePath = env.AGENTS_BASELINE;
  if (!baselinePath) {
    console.warn(
      `${PROG}: AGENTS_BASELINE is not set, so ${name} is not redeployed now; ` +
        "the deployed files stay until the next activation",
    );
    return null;
  }
  let baseline: Baseline;
  try {
    baseline = loadBaseline(baselinePath);
  } catch (error) {
    console.warn(`${PROG}: ${expectedMessage(error)}; ${name} is not redeployed now`);
    return null;
  }
  const pinned = Object.hasOwn(baseline.ui, name) ? baseline.ui[name] : undefined;
  if (!pinned) {
    console.warn(
      `${PROG}: the baseline pins no ${name} artifact; the deployed files stay until ` +
        "the next activation",
    );
    return null;
  }
  if (!fs.statSync(pinned, { throwIfNoEntry: false })?.isDirectory()) {
    console.warn(`${PROG}: the pinned ${name} artifact ${pinned} does not exist`);
    return null;
  }
  return { path: pinned, label: "baseline" };
}

/** Put the effective artifact where Herdr loads it, without publishing anything. */
export async function cmdDeployUi(
  args: { name: string; dryRun: boolean },
  env: Environment,
  console: Console,
): Promise<number> {
  validateNames([args.name]);
  const baselinePath = env.AGENTS_BASELINE;
  if (!baselinePath) {
    throw new UpdatesError("AGENTS_BASELINE is not set, so there is nothing to deploy");
  }
  const baseline = loadBaseline(baselinePath);
  const state = stateDir(env);
  fs.mkdirSync(state, { recursive: true });
  let results: [string, DeployResult][] = [];
  await withFileLock(
    stateLockPath(state),
    {
      timeout: lockTimeout(env),
      env,
      onWait: (path) => console.warn(`${PROG}: waiting for another update to finish (${path})`),
    },
    () => {
      let loaded: State = { plugins: {}, skills: {}, ui: {} };
      try {
        loaded = loadState(state);
      } catch (error) {
        // Enough of the state to deploy is not readable: the baseline still names a valid artifact,
        // so deploy that and let `check` report the corrupt file.
        console.warn(`${PROG}: ${expectedMessage(error)}; deploying the baseline only`);
      }
      const source = effectiveUiSource(baseline, loaded.ui, args.name, console);
      results = deployUi(state, env, console, { [args.name]: source }, args.dryRun);
    },
  );
  reportDeployed(console, results);
  return 0;
}

function expectedMessage(error: unknown): string {
  if (error instanceof UpdatesError) return error.message;
  throw error;
}

function tempDirectory(environment: NodeJS.ProcessEnv): string {
  return environment.TMPDIR || os.tmpdir();
}

async function withStateLock<T>(
  context: Context,
  env: Environment,
  console: Console,
  fn: () => Promise<T> | T,
): Promise<T> {
  fs.mkdirSync(context.state, { recursive: true });
  return withFileLock(
    stateLockPath(context.state),
    {
      timeout: context.lockTimeout,
      env,
      onWait: (path) => console.warn(`${PROG}: waiting for another update to finish (${path})`),
    },
    fn,
  );
}

// ---------------------------------------------------------------------------------------------
// Arguments

type Command =
  | ({ command: "update" } & UpdateArgs)
  | ({ command: "reset" } & ResetArgs)
  | { command: "status" }
  | { command: "check" }
  | { command: "resolve" }
  | { command: "deploy-ui"; name: string; dryRun: boolean };

export type ParseResult =
  | { kind: "run"; command: Command }
  | { kind: "help"; text: string }
  | { kind: "error"; text: string };

const MAIN_HELP = `usage: agents [-h] COMMAND ...

Publish the agents checkout's plugins, skills and Herdr UI as immutable snapshots.

positional arguments:
  COMMAND
    update      snapshot plugins or skills from the checkout's working tree
    reset       drop snapshots so the pinned baseline applies again
    status      show the snapshots and live session files
    check       warn about drift; always exits 0
    resolve     print the effective plugin, skill and UI paths as JSON
    deploy-ui   write a UI artifact where its app loads it; activation runs it

options:
  -h, --help    show this help message and exit

state: $XDG_STATE_HOME/agents-updates/current.json; harnesses read the effective paths with
\`agents resolve\`
`;

const COMMAND_HELP: Record<string, string> = {
  update: `usage: agents update [-h] [--skill] [--harness {pi,claude}] [--live {pi,claude,all}]
                     [--dry-run] NAME [NAME ...]

positional arguments:
  NAME

options:
  -h, --help            show this help message and exit
  --skill               NAMEs are skills, not plugins
  --harness {pi,claude} only this half of each plugin
  --live {pi,claude,all}
                        ask running sessions to reload (best effort)
  --dry-run             show what would be published
`,
  reset: `usage: agents reset [-h] [--skill] [--harness {pi,claude}] NAME [NAME ...]

positional arguments:
  NAME

options:
  -h, --help            show this help message and exit
  --skill               NAMEs are skills, not plugins
  --harness {pi,claude} only this half of each plugin
`,
  status: "usage: agents status [-h]\n\noptions:\n  -h, --help  show this help message and exit\n",
  check: "usage: agents check [-h]\n\noptions:\n  -h, --help  show this help message and exit\n",
  resolve:
    "usage: agents resolve [-h]\n\noptions:\n  -h, --help  show this help message and exit\n",
};

const isHelp = (token: string): boolean => token === "-h" || token === "--help";

function usageError(command: string | undefined, message: string): ParseResult {
  const usage =
    command === undefined
      ? "usage: agents [-h] COMMAND ..."
      : COMMAND_HELP[command]!.split("\n")[0]!;
  return { kind: "error", text: `${usage}\n${PROG}: error: ${message}\n` };
}

const choiceError = (flag: string, value: string, choices: readonly string[]): string =>
  `argument ${flag}: invalid choice: ${JSON.stringify(value)} (choose from ${choices
    .map((choice) => `'${choice}'`)
    .join(", ")})`;

export function parseArguments(argv: readonly string[]): ParseResult {
  if (argv.length === 0) {
    return usageError(undefined, "the following arguments are required: COMMAND");
  }
  if (isHelp(argv[0]!)) return { kind: "help", text: MAIN_HELP };
  const command = argv[0]!;
  if (
    command !== "update" &&
    command !== "reset" &&
    command !== "status" &&
    command !== "check" &&
    command !== "resolve" &&
    command !== "deploy-ui"
  ) {
    return usageError(
      undefined,
      `argument COMMAND: invalid choice: ${JSON.stringify(command)} (choose from 'update', 'reset', 'status', 'check', 'resolve', 'deploy-ui')`,
    );
  }
  const rest = argv.slice(1);
  // `--` ends the options: a `-h` after it is a NAME, which validateNames then refuses.
  const terminator = rest.indexOf("--");
  const options = terminator < 0 ? rest : rest.slice(0, terminator);
  if (options.some(isHelp)) return { kind: "help", text: COMMAND_HELP[command]! };
  if (command === "status" || command === "check" || command === "resolve") {
    if (rest.length > 0) return usageError(command, `unrecognized arguments: ${rest.join(" ")}`);
    return { kind: "run", command: { command } };
  }
  if (command === "deploy-ui") return parseDeployUi(rest);
  return parseNames(command, rest);
}

function parseDeployUi(rest: readonly string[]): ParseResult {
  const names: string[] = [];
  let dryRun = false;
  for (const token of rest) {
    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (token !== "-" && token.startsWith("-")) {
      return usageError("deploy-ui", `unrecognized arguments: ${token}`);
    }
    names.push(token);
  }
  if (names.length === 0) {
    return usageError("deploy-ui", "the following arguments are required: NAME");
  }
  if (names.length > 1) {
    return usageError("deploy-ui", `unrecognized arguments: ${names.slice(1).join(" ")}`);
  }
  return { kind: "run", command: { command: "deploy-ui", name: names[0]!, dryRun } };
}

function parseNames(command: "update" | "reset", rest: readonly string[]): ParseResult {
  const names: string[] = [];
  let skill = false;
  let dryRun = false;
  let harness: Harness | undefined;
  let live: LiveChoice | undefined;
  const unknown: string[] = [];

  const valueOf = (flag: string, index: number): string | ParseResult => {
    const token = rest[index]!;
    const inline = token.includes("=") ? token.slice(token.indexOf("=") + 1) : undefined;
    if (inline !== undefined) return inline;
    const next = rest[index + 1];
    if (next === undefined || (next.startsWith("--") && next !== "--")) {
      return usageError(command, `argument ${flag}: expected one argument`);
    }
    return next;
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]!;
    if (token === "--") {
      names.push(...rest.slice(index + 1));
      break;
    }
    if (token === "--skill") {
      skill = true;
      continue;
    }
    if (token === "--dry-run" && command === "update") {
      dryRun = true;
      continue;
    }
    const flag = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
    if (flag === "--harness") {
      const value = valueOf("--harness", index);
      if (typeof value !== "string") return value;
      if (!(HARNESSES as readonly string[]).includes(value)) {
        return usageError(command, choiceError("--harness", value, HARNESSES));
      }
      harness = value as Harness;
      if (!token.includes("=")) index += 1;
      continue;
    }
    if (flag === "--live" && command === "update") {
      const value = valueOf("--live", index);
      if (typeof value !== "string") return value;
      if (!(LIVE_CHOICES as readonly string[]).includes(value)) {
        return usageError(command, choiceError("--live", value, LIVE_CHOICES));
      }
      live = value as LiveChoice;
      if (!token.includes("=")) index += 1;
      continue;
    }
    if (token !== "-" && token.startsWith("-")) {
      unknown.push(token);
      continue;
    }
    names.push(token);
  }

  if (unknown.length > 0)
    return usageError(command, `unrecognized arguments: ${unknown.join(" ")}`);
  if (names.length === 0) {
    return usageError(command, "the following arguments are required: NAME");
  }
  if (command === "update")
    return { kind: "run", command: { command, names, skill, harness, live, dryRun } };
  return { kind: "run", command: { command, names, skill, harness } };
}

// ---------------------------------------------------------------------------------------------
// Entry point

export type MainOptions = {
  env?: Environment;
  out?: Output;
  err?: Output;
};

export async function main(argv: readonly string[], options: MainOptions = {}): Promise<number> {
  const console = new Console(options.out ?? process.stdout, options.err ?? process.stderr);
  const env = options.env ?? process.env;
  const parsed = parseArguments(argv);
  if (parsed.kind === "help") {
    console.stdout(parsed.text);
    return 0;
  }
  if (parsed.kind === "error") {
    console.stderr(parsed.text);
    return 2;
  }
  try {
    const command = parsed.command;
    switch (command.command) {
      case "update":
        return await cmdUpdate(command, env, console);
      case "reset":
        return await cmdReset(command, env, console);
      case "status":
        return cmdStatus(env, console);
      case "check":
        return cmdCheck(env, console);
      case "resolve":
        return cmdResolve(env, console);
      case "deploy-ui":
        return await cmdDeployUi(command, env, console);
      default:
        throw new UpdatesError(`unknown command ${(command as { command: string }).command}`);
    }
  } catch (error) {
    if (error instanceof InterruptError) {
      console.warn(`${PROG}: interrupted`);
      return 130;
    }
    if (error instanceof UpdatesError) {
      console.warn(`${PROG}: ${error.message}`);
      return 1;
    }
    if (isSystemError(error)) {
      console.warn(`${PROG}: ${error.message}`);
      return 1;
    }
    throw error;
  }
}
