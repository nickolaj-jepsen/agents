/**
 * The merge every harness sees: published overrides win, a variant a snapshot does not override
 * falls back to the pin, and a name only the state knows still resolves. Also the two files that
 * feed it, so the CLI, the refresh helper and the specs read them the same way.
 */
import fs from "node:fs";
import { HARNESSES, parseBaseline, parseState } from "./protocol.ts";
import type {
  Baseline,
  PluginState,
  Resolved,
  SkillState,
  State,
  VariantPaths,
} from "./protocol.ts";
import { type WriteJsonOptions, readJsonFile, writeJsonAtomic } from "./json.ts";
import { stateFilePath } from "./paths.ts";

export function loadBaseline(path: string): Baseline {
  return parseBaseline(readJsonFile(path), path);
}

/** What `current.json` holds; an absent file is an empty state, a broken one is an error. */
export function loadState(state: string): State {
  const path = stateFilePath(state);
  if (!fs.existsSync(path)) return { plugins: {}, skills: {} };
  return parseState(readJsonFile(path), path);
}

/** Write the whole state, sorted by name and with the schema's key order, in one atomic rename. */
export function saveState(
  state: string,
  plugins: Record<string, PluginState>,
  skills: Record<string, SkillState>,
  options: WriteJsonOptions = {},
): void {
  const payload: State = { plugins: {}, skills: {} };
  for (const name of Object.keys(plugins).sort())
    payload.plugins[name] = orderedPlugin(plugins[name]!);
  for (const name of Object.keys(skills).sort()) {
    const entry = skills[name]!;
    payload.skills[name] = { path: entry.path, baseline: entry.baseline ?? "" };
  }
  writeJsonAtomic(stateFilePath(state), payload, options);
}

function orderedPlugin(entry: PluginState): PluginState {
  const ordered = {} as PluginState;
  for (const harness of HARNESSES) ordered[harness] = entry[harness] ?? null;
  ordered.baseline = entry.baseline ?? "";
  return ordered;
}

/** The paths a harness should load: overrides win, a missing variant inherits the baseline. */
export function effective(
  baseline: Baseline,
  plugins: Record<string, Partial<PluginState> | undefined>,
  skills: Record<string, Partial<SkillState> | undefined>,
): Resolved {
  const resolved: Resolved = { plugins: {}, skills: {} };
  const pluginNames = sortedUnion(Object.keys(baseline.plugins), Object.keys(plugins));
  for (const name of pluginNames) {
    const base = baseline.plugins[name];
    const override = plugins[name] ?? {};
    const entry = {} as VariantPaths;
    for (const harness of HARNESSES) entry[harness] = override[harness] || base?.[harness] || null;
    resolved.plugins[name] = entry;
  }
  const skillNames = sortedUnion(Object.keys(baseline.skills), Object.keys(skills));
  for (const name of skillNames) {
    resolved.skills[name] = skills[name]?.path || baseline.skills[name] || null;
  }
  return resolved;
}

function sortedUnion(left: string[], right: string[]): string[] {
  return [...new Set([...left, ...right])].sort();
}
