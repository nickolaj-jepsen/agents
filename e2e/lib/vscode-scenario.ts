/**
 * Scenarios for the Claude Code extension in VS Code, the sibling of `lib/scenario.ts`: the same
 * fixtures (`setup`) and stubbed turns, played by `lib/vscode.ts` instead of a terminal.
 *
 * A file `e2e/<plugin>/vscode.scenarios.ts` default-exports `vscodeScenarios({...})`. Nothing
 * here is a regression test: there are no snapshots, and `npm run e2e` does not read these files.
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Pattern } from "./screen.ts";
import { setupContext, type SetupContext } from "./setup.ts";
import type { Size, Target } from "./session.ts";
import {
  closeClaudeTab,
  launchVscode,
  mark,
  restartSession,
  VscodeSession,
  type VscodeLaunch,
  type VscodeStart,
  type VscodeState,
} from "./vscode.ts";

export type VscodeStep =
  /** Literal characters into the focused field, the message input when none is. */
  | { type: string }
  /** Named keys, in order: "Enter", "Escape", "Tab", "Down", "Ctrl+c". */
  | { press: string | string[] }
  /** Click the visible element whose own text matches; `{text, nth}` picks a later one. */
  | { click: Target }
  | { hover: Target }
  /** Block until the Claude panel shows the text (or, with `gone`, stops showing it). */
  | { wait: Pattern; gone?: boolean; timeout?: number }
  | { sleep: number }
  | { resize: Size }
  | { run: (s: VscodeSession) => Promise<void> };

export type VscodeScenario = {
  /** One line: what the screen is. */
  about?: string;
  /** Another scenario of this file to start from: its setup, start options and steps run first. */
  from?: string;
  /** Fill the folder VS Code opens. */
  setup?: (ctx: SetupContext) => void | Promise<void>;
  /** The stubbed turns and the mods to load. */
  start?: VscodeStart;
  /** The window size the steps run at; the default is cage's 1280x720. */
  size?: Size;
  steps?: VscodeStep[];
};

export type VscodeSet = {
  plugin: string;
  /** Tells this file's type from a terminal's `ScenarioSet`. */
  harness: "vscode";
  scenarios: Record<string, VscodeScenario>;
};

/** Identity, for the types. */
export const vscodeScenarios = (set: VscodeSet) => set;

export type VscodeResolved = {
  plugin: string;
  name: string;
  about: string;
  setup: NonNullable<VscodeScenario["setup"]>[];
  start: VscodeStart;
  size?: Size;
  steps: VscodeStep[];
};

export function resolveVscode(set: VscodeSet, name: string, seen: string[] = []): VscodeResolved {
  const s = set.scenarios[name];
  if (!s)
    throw new Error(
      `${set.plugin}/vscode: no scenario "${name}" (has ${Object.keys(set.scenarios).join(", ")})`,
    );
  if (seen.includes(name)) throw new Error(`scenario "from" loop: ${[...seen, name].join(" -> ")}`);
  const base = s.from ? resolveVscode(set, s.from, [...seen, name]) : undefined;
  return {
    plugin: set.plugin,
    name,
    about: s.about ?? base?.about ?? "",
    setup: [...(base?.setup ?? []), ...(s.setup ? [s.setup] : [])],
    start: {
      turns: s.start?.turns ?? base?.start.turns,
      plugins: s.start?.plugins ?? base?.start.plugins,
      env: { ...base?.start.env, ...s.start?.env },
      bin: base?.start.bin || s.start?.bin ? { ...base?.start.bin, ...s.start?.bin } : undefined,
      hide:
        base?.start.hide || s.start?.hide
          ? [...(base?.start.hide ?? []), ...(s.start?.hide ?? [])]
          : undefined,
      mcp: s.start?.mcp ?? base?.start.mcp,
      settings: { ...base?.start.settings, ...s.start?.settings },
    },
    size: s.size ?? base?.size,
    steps: [...(base?.steps ?? []), ...(s.steps ?? [])],
  };
}

const e2eRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Every `e2e/<plugin>/vscode.scenarios.ts`. */
export function vscodeFiles(plugin?: string): { plugin: string; file: string }[] {
  const out: { plugin: string; file: string }[] = [];
  for (const dir of readdirSync(e2eRoot, { withFileTypes: true })) {
    if (!dir.isDirectory() || (plugin && dir.name !== plugin)) continue;
    const file = join(e2eRoot, dir.name, "vscode.scenarios.ts");
    if (existsSync(file)) out.push({ plugin: dir.name, file });
  }
  return out;
}

export async function loadVscodeSet(file: string): Promise<VscodeSet> {
  const mod = (await import(pathToFileURL(file).href)) as { default: VscodeSet };
  return mod.default;
}

export async function playVscode(session: VscodeSession, steps: VscodeStep[]) {
  for (const step of steps) {
    if ("type" in step) await session.type(step.type);
    else if ("press" in step) await session.press(step.press);
    else if ("click" in step) await session.click(step.click);
    else if ("hover" in step) await session.hover(step.hover);
    else if ("wait" in step)
      await session.wait(step.wait, { gone: step.gone, timeout: step.timeout });
    else if ("sleep" in step) await new Promise((r) => setTimeout(r, step.sleep));
    else if ("resize" in step) await session.resize(step.resize[0], step.resize[1]);
    else await step.run(session);
  }
}

/** Starts VS Code on the scenario and plays its steps; the window is left on the screen. */
/**
 * Plays a scenario again in the window `reachVscode` left in `runDir`, without a new window: a
 * new Claude tab (so its `claude` reads the mods from disk again), the stub's turns from the
 * first, and the fixture rebuilt in the same folder. The scenario may be another of the plugin's,
 * if its window would be started the same way.
 */
export async function reloadVscode(r: VscodeResolved, runDir: string): Promise<VscodeSession> {
  await closeClaudeTab(runDir, r.start);
  mark("reload: tab closed");
  const cwd = join(runDir, "cwd");
  for (const entry of readdirSync(cwd)) rmSync(join(cwd, entry), { recursive: true, force: true });
  const ctx = setupContext(runDir, cwd);
  for (const setup of r.setup) await setup(ctx);
  await restartSession(runDir, r.start);
  mark("reload: fixture and stub reset");
  const session = await VscodeSession.attach(runDir);
  if (r.size) await session.resize(r.size[0], r.size[1]);
  await playVscode(session, r.steps);
  mark("reload: steps played");
  return session;
}

export async function reachVscode(
  r: VscodeResolved,
  runDir: string,
  launch?: VscodeLaunch,
): Promise<{ session: VscodeSession; state: VscodeState }> {
  const cwd = join(runDir, "cwd");
  mkdirSync(cwd, { recursive: true });
  const ctx = setupContext(runDir, cwd);
  for (const setup of r.setup) await setup(ctx);
  mark("reach: fixture set up");
  const state = await launchVscode(runDir, cwd, r.start, launch);
  const session = await VscodeSession.attach(runDir);
  try {
    if (r.size) await session.resize(r.size[0], r.size[1]);
    mark("reach: sized");
    await playVscode(session, r.steps);
    mark("reach: steps played");
    return { session, state };
  } catch (error) {
    session.close();
    throw error;
  }
}
