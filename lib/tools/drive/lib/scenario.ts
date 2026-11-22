/**
 * A scenario is a named screen of one plugin in one agent: the fixture that is set up,
 * how the agent starts, and the steps that reach the screen. Test files and the CLI's
 * `goto` read the same definitions.
 *
 * A file `<harness>.scenarios.ts` in a package's e2e folder (`lib/packages.ts`) default-exports `scenarios({...})`.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { HarnessName, StartOptions } from "./harness.ts";
import { entries } from "./find.ts";
import { e2ePackage } from "./packages.ts";
import type { Mask, Pattern, Region } from "./screen.ts";
import {
  EXTREME_SIZES,
  SIZES,
  Session,
  type SetupContext,
  type Size,
  type Target,
} from "./session.ts";

export type Step =
  /** Literal characters into the focused input. */
  | { type: string }
  /** Text as one bracketed paste. */
  | { paste: string }
  /** Named keys, in order: "Enter", "Escape", "Tab", "Down", "Ctrl+c", "Alt+a". */
  | { press: string | string[] }
  /** Click the first visible occurrence of the text; `{text, nth}` picks a later one. */
  | { click: Target }
  | { doubleClick: Target }
  /** Move the pointer onto the text. */
  | { hover: Target }
  /** Block until the screen shows the text (or, with `gone`, stops showing it). */
  | { wait: Pattern; gone?: boolean; timeout?: number }
  | { sleep: number }
  | { resize: Size }
  /** Anything else. */
  | { run: (s: Session) => Promise<void> };

export type Scenario = {
  /** One line: what the screen is. Shown by `goto` without a name and in test names. */
  about?: string;
  /** Another scenario of this file to start from: its setup, start options and steps run first. */
  from?: string;
  /** Fill the folder the agent runs in. */
  setup?: (ctx: SetupContext) => void | Promise<void>;
  start?: StartOptions;
  /** The size the steps run at. Default 160x45. */
  size?: Size;
  steps?: Step[];
  /** The plugin's own surface, which a snapshot crops to. Falls back to the file's. */
  region?: Region;
  /** Masks on top of the built-in ones (version, cost, clock and elapsed times, uuids, tmp paths) and the file's. */
  mask?: Mask[];
  /**
   * Steps that put the session back on the screen this scenario started from (its `from`, or the
   * fresh start), so a sibling can play in the same session instead of starting its own. Run only
   * between two siblings, after this one's snapshots; leave it out where nothing can undo the steps.
   */
  reset?: Step[];
  /** Always plays in a session of its own: no scenario continues from it, and it continues none. */
  fresh?: boolean;
  /** Snapshot at 70x24, 112x32, 160x45 and 240x60 rather than the first and last. For the state with the most text. */
  extreme?: boolean;
  /** The sizes to snapshot at, in place of the usual two or four. */
  sizes?: Size[];
  /**
   * `false`: a screen to look at (`drive live`, `goto`), with no snapshot and no test: the e2e run
   * leaves it out. For a fixture that has no committed screen.
   */
  snapshots?: false;
  /**
   * A known failure: why. The test passes while the scenario fails (a step throws or the
   * snapshot differs) and fails once it starts passing, so the day it is fixed it says so.
   */
  expectFail?: string;
};

export type ScenarioSet = {
  /** The package the scenarios belong to (`lib/packages.ts`): an app, or `kit-<name>`. */
  plugin: string;
  /** What a snapshot's first line calls the plugin, when that is not the package (`kit` for every kit package's). */
  label?: string;
  harness: HarnessName;
  /** Default region and masks for every scenario of the file. */
  region?: Region;
  mask?: Mask[];
  /** How every scenario of the file starts, under each one's own `start`. */
  start?: StartOptions;
  scenarios: Record<string, Scenario>;
};

/** Identity, for the types. */
export const scenarios = (set: ScenarioSet) => set;

export type Resolved = {
  plugin: string;
  /** What a snapshot calls it. */
  label: string;
  harness: HarnessName;
  name: string;
  about: string;
  setup: NonNullable<Scenario["setup"]>[];
  start: StartOptions;
  size: Size;
  steps: Step[];
  region: Region;
  mask: Mask[];
  sizes: Size[];
  expectFail?: string;
  /** What this scenario adds to its parent's (`from`): its own steps, and whether it has its own setup or start. */
  from?: string;
  ownSteps: Step[];
  ownSetup: boolean;
  ownStart: boolean;
  reset?: Step[];
  fresh: boolean;
};

const merge = (a: StartOptions, b: StartOptions = {}): StartOptions => ({
  args: [...(a.args ?? []), ...(b.args ?? [])],
  env: { ...a.env, ...b.env },
  turns: b.turns ?? a.turns,
  mcp: b.mcp ?? a.mcp,
  hermetic: b.hermetic ?? a.hermetic,
  plugins: b.plugins ?? a.plugins,
  bin: b.bin ?? a.bin,
  hide: b.hide ?? a.hide,
});

export function resolveScenario(set: ScenarioSet, name: string, seen: string[] = []): Resolved {
  const s = set.scenarios[name];
  if (!s)
    throw new Error(
      `${set.plugin}/${set.harness}: no scenario "${name}" (has ${Object.keys(set.scenarios).join(", ")})`,
    );
  if (seen.includes(name)) throw new Error(`scenario "from" loop: ${[...seen, name].join(" -> ")}`);
  const base = s.from ? resolveScenario(set, s.from, [...seen, name]) : undefined;
  return {
    plugin: set.plugin,
    label: set.label ?? set.plugin,
    harness: set.harness,
    name,
    about: s.about ?? base?.about ?? "",
    setup: [...(base?.setup ?? []), ...(s.setup ? [s.setup] : [])],
    start: merge(base?.start ?? set.start ?? {}, s.start),
    size: s.size ?? base?.size ?? [160, 45],
    steps: [...(base?.steps ?? []), ...(s.steps ?? [])],
    region: s.region ?? (s.from ? base?.region : undefined) ?? set.region ?? fullRegion,
    mask: [...(set.mask ?? []), ...(base?.mask ?? []), ...(s.mask ?? [])],
    sizes: s.sizes ?? (s.extreme ? EXTREME_SIZES : SIZES),
    expectFail: s.expectFail,
    from: s.from,
    ownSteps: s.steps ?? [],
    ownSetup: !!s.setup,
    ownStart: !!s.start,
    reset: s.reset,
    fresh: !!s.fresh,
  };
}

/**
 * Types `/<name>` once the slash menu offers it, and leaves it in the prompt. A mod registers its
 * command after Claude's prompt shows, and a command typed before then is lost; under a few
 * sessions at once that can take seconds. `about` is the start of the command's description, which
 * tells the menu's row from what was typed.
 */
export const slashCommand = (name: string, about: string): Step => ({
  run: async (session) => {
    const typed = `/${name}`;
    const row = new RegExp(`${escape(typed)}\\s+.*${escape(about)}`);
    let deadline = Date.now() + 45_000;
    let broken: string | undefined;
    for (;;) {
      await session.type(typed, { settle: false });
      try {
        await session.wait(row, { timeout: 2000 });
        return;
      } catch (err) {
        // A mod that did not load says so in the transcript, and only a write to it can change
        // that: when it is likely this command's (`kit-catalog` for `/kit`), wait a few seconds
        // more, not the whole wait. Another mod's failure only goes into the message.
        if (!broken) {
          broken = modLoadError(await session.text());
          const mod = broken && /^● (\S+):/.exec(broken)?.[1];
          if (mod && (mod.includes(name) || name.includes(mod)))
            deadline = Math.min(deadline, Date.now() + 5000);
        }
        if (Date.now() > deadline)
          throw new Error(
            `${typed} never showed in the slash menu${broken ? `:\n${broken}\n` : ": "}${String(err)}`,
          );
        await session.press(Array<string>(typed.length).fill("Backspace"), { settle: false });
      }
    }
  },
});

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Claude's `● <mod>: hooks module did not load: …` and the lines it wraps onto, if shown. */
export function modLoadError(text: string): string | undefined {
  const rows = text.split("\n");
  const at = rows.findIndex((row) => /^● \S+: hooks module did not load/.test(row));
  if (at < 0) return undefined;
  // Its wrapped lines are indented two; so is the slash menu's "No commands match".
  const end = rows.findIndex(
    (row, i) => i > at && (!/^ {2}\S/.test(row) || /^ {2}No commands/.test(row)),
  );
  return rows
    .slice(at, end < 0 ? undefined : end)
    .map((row) => row.replace(/\s*│.*$/, "").trimEnd())
    .join("\n");
}

const fullRegion: Region = (grid) => ({ x: 0, y: 0, w: grid[0]?.length ?? 0, h: grid.length });

export async function play(session: Session, steps: Step[]) {
  for (const [i, step] of steps.entries()) {
    // A `wait` that follows says what to be still for: the step before it need not.
    const o = { settle: !("wait" in (steps[i + 1] ?? {})) };
    if ("type" in step) await session.type(step.type, o);
    else if ("paste" in step) await session.paste(step.paste, o);
    else if ("press" in step)
      await session.press(Array.isArray(step.press) ? step.press : [step.press], o);
    else if ("click" in step) await session.click(step.click, 1, o);
    else if ("doubleClick" in step) await session.click(step.doubleClick, 2, o);
    else if ("hover" in step) await session.hover(step.hover, o);
    else if ("wait" in step) {
      await session.wait(step.wait, { gone: step.gone, timeout: step.timeout });
      // What a `wait` saw may still be drawing, and a click or key sent now can land before the
      // screen is wired to take it: be still before the next move, unless that is another wait.
      if (steps[i + 1] && !("wait" in steps[i + 1]!)) await session.settle();
    } else if ("sleep" in step) await new Promise((r) => setTimeout(r, step.sleep));
    else if ("resize" in step) await session.resize(step.resize[0], step.resize[1]);
    else await step.run(session);
  }
}

/** Starts the scenario's agent and plays its steps; the session is left on the screen. */
export async function reach(r: Resolved, backend: "lib" | "daemon", name: string, runDir?: string) {
  const session = await Session.open({
    harness: r.harness,
    start: r.start,
    setup: r.setup,
    size: r.size,
    backend,
    name,
    runDir,
  });
  try {
    await play(session, r.steps);
    await session.settle();
  } catch (err) {
    await failShot(session, r);
    await session.close();
    throw err;
  }
  return session;
}

/** The screen a scenario stopped on, as a PNG beside its snapshots (git-ignored); an expected failure needs none. */
export async function failShot(session: Session, r: Resolved) {
  if (r.expectFail) return;
  const path = snapshotPath(r, r.size, "png").replace(/@.*$/, "@failed.actual.png");
  await session.png(path).catch(() => undefined);
}

// ---- discovery

/** The driver's own folder (`lib/tools/drive`). */
export const driveRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every terminal `<harness>.scenarios.ts` (claude, pi) of the packages `plugin` stands for, or of all
 * packages with e2e scenarios: `kit` is every kit package and `apps` every app.
 */
export function scenarioFiles(
  plugin?: string,
): { plugin: string; harness: HarnessName; file: string }[] {
  return entries(plugin || undefined, ["claude", "pi"]).map((e) => ({
    plugin: e.package,
    harness: e.harness as HarnessName,
    file: e.file,
  }));
}

export async function loadSet(file: string): Promise<ScenarioSet> {
  const mod = (await import(pathToFileURL(file).href)) as { default: ScenarioSet };
  return mod.default;
}

/** Where a state's snapshot lives; the PNG beside it has the same stem. */
export const snapshotPath = (r: Resolved, size: Size, ext: "snap" | "png") => {
  const pkg = e2ePackage(r.plugin);
  if (!pkg) throw new Error(`no package ${r.plugin} with an e2e folder`);
  return join(pkg.e2e, "__snapshots__", r.harness, `${r.name}@${size[0]}x${size[1]}.${ext}`);
};
