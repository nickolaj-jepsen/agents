/**
 * Site scenarios: the project site's media, played from `e2e/<plugin>/site.scenarios.ts` and never
 * from the regression files.
 *
 * A plugin has a `demo` per harness at most, recorded as a video with its last screen as the
 * poster, and any number of `stills`, captured and captioned. The agent is the same real Claude
 * Code or pi the regression scenarios drive, on the model stub or pi's replayed turns, so a run
 * needs no model call and comes out the same each time.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { HarnessName } from "./harness.ts";
import { e2eRoot, type Scenario, type ScenarioSet, type Step } from "./scenario.ts";
import type { Size } from "./session.ts";

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

export type SiteScenario = Scenario & {
  /** One sentence under the picture. */
  caption: string;
  /** The folder the agent runs in, as its header shows it (`/tmp/s-x7k2/<project>`). Default `app`. */
  project?: string;
  /** The agent it runs in. Default claude. */
  harness?: HarnessName;
};

export type SiteDemo = SiteScenario & {
  /** Played before the recording starts: the part of the tour a viewer need not sit through. */
  prepare?: Scenario["steps"];
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
};

/** Identity, for the types. */
export const site = (set: SiteSet) => set;

/** A scenario file's plugins: every `e2e/<plugin>/site.scenarios.ts`. */
export function siteFiles(only: string[] = []): { plugin: string; file: string }[] {
  const out: { plugin: string; file: string }[] = [];
  for (const plugin of only.length > 0 ? only : listPlugins()) {
    const file = join(e2eRoot, plugin, "site.scenarios.ts");
    if (existsSync(file)) out.push({ plugin, file });
    else if (only.length > 0) throw new Error(`no e2e/${plugin}/site.scenarios.ts`);
  }
  return out;
}

const listPlugins = () =>
  readdirSync(e2eRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "lib" && !d.name.startsWith("."))
    .map((d) => d.name)
    .sort();

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
