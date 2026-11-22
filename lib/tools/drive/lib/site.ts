import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { checkoutRoot, type HarnessName } from "./harness.ts";
import { e2ePackage, e2ePackages } from "./packages.ts";
import type { Scenario, ScenarioSet, Step } from "./scenario.ts";
import type { Size } from "./session.ts";
import type { VscodeStep } from "./vscode-scenario.ts";

/** The terminal a site scenario runs in unless it sets `size`: wide enough for a ~1000px column. */
export const SITE_SIZE: Size = [120, 34];

/** Image scale: 1 gives 1278x818 px for 120x34 cells. */
export const ZOOM = 1;
/** A recording renders at twice an image's size for the same zoom; this makes it the poster's. */
export const VIDEO_ZOOM = 0.5;
/** Frames per second of a recording, capped: a terminal changes in bursts. Under ~25 a fast typist's keys merge into one frame. */
export const FPS = 30;
/** Seconds a quiet stretch of a recording is cut to at most. */
export const IDLE = 6;

/** What the site's check allows a file. */
export const BUDGET = { mp4: 1024 * 1024, png: 300 * 1024 };

/** The VS Code window a `vscode` picture is taken in: cage's output, wide enough that a pane docks beside the chat. */
export const VSCODE_SIZE: Size = [1280, 720];
/** The VS Code recorder's manifest beside `media.json`, which the terminal's recorder writes. */
export const VSCODE_MANIFEST = "media-vscode.json";
/** A file of `site/media/<plugin>/` that the VS Code recorder writes, and the terminal's leaves alone. */
export const isVscodeFile = (name: string) =>
  name === VSCODE_MANIFEST || name.startsWith("vscode-");

export type SiteScenario = Scenario & {
  /** One sentence under the picture. */
  caption: string;
  /** Capture embedded Kitty images on a private display instead of using the tui-test rasterizer. */
  capture?: "kitty";
  /** The folder the agent runs in, as its header shows it (`/tmp/s-x7k2/<project>`). Default `app`. */
  project?: string;
  /** The agent it runs in. Default claude. */
  harness?: HarnessName;
};

export type SiteDemo = SiteScenario & {
  /** Played before the recording starts: the part of the tour a viewer need not sit through. */
  prepare?: Scenario["steps"];
};

/** A picture of the mod in VS Code's Claude Code extension: the panel at `VSCODE_SIZE`. */
export type SiteVscode = {
  /** One sentence under the picture. */
  caption: string;
  /** The scenario of `e2e/<plugin>/vscode.scenarios.ts` that reaches the screen. */
  scenario: string;
  /** Played after the scenario's own steps, for a screen it stops short of. */
  steps?: VscodeStep[];
};

export type SiteSet = {
  plugin: string;
  /**
   * The tour, recorded: its `steps` are the video, its last screen the poster. A plugin with both
   * halves gives one per harness, the first shown first; at most one per harness.
   */
  demo?: SiteDemo | SiteDemo[];
  /** Named screens in display order. */
  stills: Record<string, SiteScenario>;
  /** Named pictures of the Claude panel in VS Code, in display order, as `vscode-<name>.png`. */
  vscode?: Record<string, SiteVscode>;
};

/** Identity, for the types. */
export const site = (set: SiteSet) => set;

/** A scenario file's plugins: every `site.scenarios.ts` of an app's e2e folder. */
export function siteFiles(only: string[] = []): { plugin: string; file: string }[] {
  const out: { plugin: string; file: string }[] = [];
  for (const plugin of only.length > 0 ? only : listPlugins()) {
    const pkg = e2ePackage(plugin);
    const file = pkg && join(pkg.e2e, "site.scenarios.ts");
    if (file && existsSync(file)) out.push({ plugin, file });
    else if (only.length > 0) throw new Error(`no site.scenarios.ts in ${plugin}'s e2e folder`);
  }
  return out;
}

const listPlugins = () => e2ePackages().map((p) => p.name);

/** A set's demos with their harness and file name: `demo` for the first, `demo-<harness>` after. */
export function demosOf(set: SiteSet): { demo: SiteDemo; harness: HarnessName; base: string }[] {
  const list = set.demo === undefined ? [] : Array.isArray(set.demo) ? set.demo : [set.demo];
  const out = list.map((demo, i) => {
    const harness = demo.harness ?? "claude";
    return { demo, harness, base: i === 0 ? "demo" : `demo-${harness}` };
  });
  if (new Set(out.map((d) => d.harness)).size !== out.length)
    throw new Error(`${set.plugin}: one demo per harness`);
  return out;
}

/** The scenarios of one harness as a regular scenario set, so `resolveScenario` can read them. */
export function asSet(set: SiteSet, harness: HarnessName): ScenarioSet {
  const scenarios: ScenarioSet["scenarios"] = {};
  const demo = demosOf(set).find((d) => d.harness === harness)?.demo;
  if (demo) scenarios.demo = { size: SITE_SIZE, ...demo };
  for (const [name, s] of Object.entries(set.stills))
    if ((s.harness ?? "claude") === harness) scenarios[name] = { size: SITE_SIZE, ...s };
  return { plugin: set.plugin, harness, scenarios };
}

/** A small seeded generator (mulberry32), so a recording's rhythm is the same on every run. */
function rng(seed: string) {
  let a = 0x9e3779b9;
  for (const ch of seed) a = Math.imul(a ^ ch.charCodeAt(0), 0x85ebca6b) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Types `text` a key at a time, as a person does, for a video: `ms` is the average gap between
 * keys. The gaps vary, run longer after a space or punctuation and now and then hesitate, and
 * each key is scheduled against the start, so the time a key takes to send does not stretch the
 * next gap. A short beat at the end is the glance before Enter.
 */
export const slow = (text: string, ms = 70, beat = 350): Step => ({
  run: async (s) => {
    const rand = rng(text);
    const t0 = Date.now();
    let due = 0;
    for (const ch of text) {
      const wait = t0 + due - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      await s.term.type(ch);
      let gap = ms * (0.55 + rand() * 0.9);
      if (ch === " ") gap *= 1.25;
      else if (/[.,/`:;?!]/.test(ch)) gap *= 1.6;
      if (rand() < 0.04) gap += 150 + rand() * 250;
      due += gap;
    }
    await new Promise((r) => setTimeout(r, beat * (0.8 + rand() * 0.4)));
  },
});

/** The most a pause is cut to, ms. */
const PAUSE_MAX = 2600;

/**
 * A demo's steps as a person would pace them. A `sleep` is the author's rough dwell, and every
 * key or click already waits for the screen to settle on top of it, so it is cut to 70% and
 * varied by a fifth either way, so a run of equal sleeps does not tick like a metronome; none
 * runs past `PAUSE_MAX`, the last one (the hold on the result) a little longer. Other steps pass.
 */
export function pace(steps: Step[], seed: string): Step[] {
  const rand = rng(seed);
  const last = steps.map((s) => "sleep" in s).lastIndexOf(true);
  return steps.map((step, i) => {
    if (!("sleep" in step)) return step;
    const cap = i === last ? PAUSE_MAX * 1.2 : PAUSE_MAX;
    const ms = Math.min(cap, step.sleep * 0.7 * (0.8 + rand() * 0.4));
    return { sleep: Math.round(Math.max(150, ms)) };
  });
}

/** In a demo: the poster is the screen at this step, not the last one. */
export const poster: Step = {
  run: async (s) => {
    if (s.poster) await s.png(s.poster.path, s.poster.opts);
  },
};

/** A key `n` times, `ms` apart: a field that redraws on every key drops keys sent faster. */
export const slowPress = (key: string, n: number, ms = 70): Step => ({
  run: async (s) => {
    for (let i = 0; i < n; i++) {
      await s.term.press(key);
      await new Promise((r) => setTimeout(r, ms));
    }
  },
});

/** A PNG's pixel size, from its header. */
export function pngSize(path: string) {
  const head = readFileSync(path).subarray(16, 24);
  return { width: head.readUInt32BE(0), height: head.readUInt32BE(4) };
}

export const kb = (path: string) => `${(statSync(path).size / 1024).toFixed(0)} KB`;

export const onPath = (tool: string) => {
  try {
    execFileSync("sh", ["-c", `command -v ${tool}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/** `file` brought under `budget` bytes by a pass of a tool that is not part of the repo's shell, or left as is. */
export function squeeze(file: string, budget: number) {
  // A PNG within 15% of its budget is squeezed too, so a run that comes out a little larger still fits.
  if (statSync(file).size <= (file.endsWith(".png") ? budget * 0.85 : budget)) return;
  if (file.endsWith(".png")) {
    const args = ["-o", "4", "--strip", "all", "-q", file];
    if (onPath("oxipng")) execFileSync("oxipng", args, { stdio: "inherit" });
    else
      execFileSync("nix", ["run", "--inputs-from", checkoutRoot, "nixpkgs#oxipng", "--", ...args], {
        stdio: "inherit",
      });
  }
  if (statSync(file).size > budget)
    throw new Error(
      `${relative(checkoutRoot, file)} is ${kb(file)}, over its ${budget / 1024} KB budget`,
    );
}

/**
 * pngquant, then oxipng: a UI's flat colours and its text keep their edges in a palette at a
 * fraction of the size. 98 and 99 are a file pngquant left as it was.
 */
export function optimise(files: string[]) {
  if (files.length === 0) return;
  const script = [
    'pngquant --quality 85-100 --speed 1 --strip --skip-if-larger --force --ext .png -- "$@"; s=$?',
    '{ [ $s -eq 0 ] || [ $s -eq 98 ] || [ $s -eq 99 ]; } && oxipng --quiet --opt 4 --strip safe -- "$@"',
  ].join("; ");
  const args = ["-c", script, "sh", ...files];
  const run =
    onPath("pngquant") && onPath("oxipng")
      ? spawnSync("sh", args, { stdio: "inherit" })
      : spawnSync(
          "nix",
          [
            "shell",
            "--inputs-from",
            checkoutRoot,
            "nixpkgs#pngquant",
            "nixpkgs#oxipng",
            "--command",
            "sh",
            ...args,
          ],
          { stdio: "inherit" },
        );
  if (run.status !== 0) throw new Error("pngquant or oxipng failed");
}
