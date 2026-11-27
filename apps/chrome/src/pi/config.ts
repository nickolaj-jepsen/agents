/**
 * The configuration the host supplies, if it supplies one: `$PI_CHROME_CONFIG` names a JSON file
 * with the person's roles, watched providers, router models and short model names. The palette
 * itself stays pi's own theme, and no preferred model is chosen here — which model answers is pi's
 * setting. Reading it at the boundary is what keeps a typo a notification rather than a broken
 * frame: what does not parse falls back to the neutral value.
 *
 * A session that never sets the variable gets the neutral frame, so the plugin is installable with
 * no configuration at all.
 */
import { readFileSync } from "node:fs";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { NEUTRAL, readConfig, type ChromeConfig, type ConfigProblem } from "../lib/config.ts";

/** The variable that names the configuration file, as a host writes it. */
export const CONFIG_ENV = "PI_CHROME_CONFIG";

export type LoadedConfig = {
  config: ChromeConfig;
  problems: ConfigProblem[];
  /** The file the configuration was read from, when there was one. */
  source?: string;
};

/** The host's configuration, or the neutral one: a file that cannot be read is a problem, not a throw. */
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): LoadedConfig => {
  const file = env[CONFIG_ENV];
  if (!file) return { config: NEUTRAL, problems: [] };
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    return {
      config: NEUTRAL,
      problems: [{ where: "", problem: `cannot be read: ${(error as Error).message}` }],
      source: file,
    };
  }
  return { ...readConfig(text), source: file };
};

/** Says what of the host's configuration the frame refused, and what it used instead. */
export const reportConfig = (ctx: ExtensionContext, loaded: LoadedConfig): void => {
  for (const { where, problem } of loaded.problems)
    ctx.ui.notify(
      `chrome: ${loaded.source ?? CONFIG_ENV}${where ? ` ${where}:` : ""} ${problem}`,
      "warning",
    );
};
