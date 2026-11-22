/**
 * Scenarios for the Claude Desktop app, the sibling of `lib/scenario.ts`: the same fixtures
 * (`setup`) and stubbed turns. Desktop is launched, not driven: there is no way in to read its
 * screen, so a scenario only says what folder and session it opens on.
 *
 * A file `desktop.scenarios.ts` in a package's e2e folder default-exports `desktopScenarios({...})`.
 * Nothing here is a regression test.
 */
import type { Turn } from "./harness.ts";
import type { SetupContext } from "./setup.ts";

export type DesktopScenario = {
  /** One line: what the screen is. */
  about?: string;
  /** Fill the folder Desktop opens. */
  setup?: (ctx: SetupContext) => void | Promise<void>;
  /**
   * The session Desktop resumes: a real Claude Code replays `turns` through the stub to
   * `prompt` before Desktop starts, and Desktop opens the saved session. The mods to load default to
   * every built one.
   */
  start?: { turns?: Turn[]; plugins?: string[] };
  /** The message of the seeded session. */
  prompt?: string;
  /**
   * `--draft`: instead of a seeded session, a new one with this draft prefilled, for a real model.
   * The folder's files (see `setup`) are what it can read.
   */
  draft?: string;
};

export type DesktopSet = {
  plugin: string;
  harness: "desktop";
  scenarios: Record<string, DesktopScenario>;
};

/** Identity, for the types. */
export const desktopScenarios = (set: DesktopSet) => set;

export type DesktopResolved = {
  plugin: string;
  name: string;
  about: string;
  setup?: DesktopScenario["setup"];
  start: NonNullable<DesktopScenario["start"]>;
  prompt: string;
  draft?: string;
};

export function resolveDesktop(set: DesktopSet, name: string): DesktopResolved {
  const s = set.scenarios[name];
  if (!s)
    throw new Error(
      `${set.plugin}/desktop: no scenario "${name}" (has ${Object.keys(set.scenarios).join(", ")})`,
    );
  return {
    plugin: set.plugin,
    name,
    about: s.about ?? "",
    setup: s.setup,
    start: s.start ?? {},
    prompt: s.prompt ?? `Show me the ${name} scenario.`,
    draft: s.draft,
  };
}
