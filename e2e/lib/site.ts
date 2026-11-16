/**
 * Site scenarios: the media of the project site, played from `e2e/<plugin>/site.scenarios.ts`
 * (never the regression files, which no site run reads and the regression run never sees these).
 *
 * A plugin has at most one `demo`, a tour that is recorded as a video with its last screen as the
 * poster, and any number of `stills`, named screens captioned and shot as PNGs. The agent is the
 * same real Claude Code or pi the regression scenarios drive, on the model stub or pi's replayed
 * turns, so a run needs no model call and comes out the same each time.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { HarnessName } from "./harness.ts";
import { e2eRoot, type Scenario, type ScenarioSet, type Step } from "./scenario.ts";
import type { Size } from "./session.ts";

/**
 * The canvas of every image and video: the user's terminal background (the fireproof theme in
 * ~/nixos/modules/base/theme.nix), so the media sit on the site's dark page like a window of it.
 */
export const BACKGROUND = "#1C1B1A";

/** The terminal a site scenario runs in unless it sets `size`: wide enough for a ~1000px column. */
export const SITE_SIZE: Size = [120, 34];

/** Image scale: 1 gives 1278x818 px for 120x34 cells. */
export const ZOOM = 1;
/** A recording renders at twice an image's size for the same zoom; this makes it the poster's. */
export const VIDEO_ZOOM = 0.5;
/** Frames per second of a recording, capped: a terminal changes in bursts. */
export const FPS = 12;
/** Seconds a quiet stretch of a recording is cut to at most. */
export const IDLE = 6;

/** What the budgets (enforced by the site's check) allow a file. */
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
  /** The tour, recorded: its `steps` are the video, its last screen the poster. */
  demo?: SiteDemo;
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

/** The scenarios of one harness as a regular scenario set, so `resolveScenario` can read them. */
export function asSet(set: SiteSet, harness: HarnessName): ScenarioSet {
  const scenarios: ScenarioSet["scenarios"] = {};
  if (set.demo && (set.demo.harness ?? "claude") === harness)
    scenarios.demo = { size: SITE_SIZE, ...set.demo };
  for (const [name, s] of Object.entries(set.stills))
    if ((s.harness ?? "claude") === harness) scenarios[name] = { size: SITE_SIZE, ...s };
  return { plugin: set.plugin, harness, scenarios };
}

/** Types `text` a key at a time, as a person does, for a video: `ms` between keys. */
export const slow = (text: string, ms = 35): Step => ({
  run: async (s) => {
    for (const ch of text) {
      await s.term.type(ch);
      await new Promise((r) => setTimeout(r, ms));
    }
  },
});

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
