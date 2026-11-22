/**
 * `drive record [package]`: plays a package's site scenarios and writes its media under
 * `apps/site/media/<package>/` (a kit package's: `apps/site/media/kit/<name>/`), and nothing anywhere else. The folder's old files of the same
 * kind are removed when the new ones are moved in, so none outlives its scenario.
 *
 * - an app's tour and stills (`site.scenarios.ts`, terminal): `demo.mp4`, `<still>.png`, `media.json`;
 * - its pictures in VS Code (`site.scenarios.ts`' `vscode`): `vscode-<name>.png`, `media-vscode.json`;
 * - a kit package's graphical stories in VS Code (its `vscode.scenarios.ts`), at the window's size and in a
 *   narrow pane: `vscode-<component>-<state>[-narrow].png` and `media-vscode.json`, in the package's own folder;
 * - a kit package's stories (its `claude`/`pi` scenarios) as crops, in its own folder
 *   `apps/site/media/kit/<package>/<harness>/<story>@WxH.png`, listed in that folder's `crops.json`.
 *
 * A package whose run fails keeps its old files and its staging folder, which it names: the media
 * are staged in a folder of their own and moved in only when every scenario came out and fits its
 * budget. Publishing one recorder's files leaves the other recorder's in the folder.
 */
import { execFile, execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import { actualOf, captureMedia } from "./check.ts";
import { cropToRegion } from "./crop.ts";
import { entries, packagesNamed } from "./find.ts";
import { checkoutRoot } from "./harness.ts";
import { WRITES } from "./linear-mcp.ts";
import { photograph, publish, retainFailure } from "./media.ts";
import { options } from "./options.ts";
import type { E2EPackage } from "./packages.ts";
import { realStage, runAll } from "./runner.ts";
import { loadSet, play, resolveScenario, type ScenarioSet } from "./scenario.ts";
import { Session } from "./session.ts";
import {
  asSet,
  BUDGET,
  demosOf,
  FPS,
  IDLE,
  isVscodeFile,
  kb,
  optimise,
  pace,
  pngSize,
  squeeze,
  VIDEO_ZOOM,
  VSCODE_MANIFEST,
  VSCODE_SIZE,
  ZOOM,
  type SiteSet,
  type SiteVscode,
} from "./site.ts";
import {
  loadVscodeSet,
  reachVscode,
  reloadVscode,
  resolveVscode,
  type VscodeSet,
} from "./vscode-scenario.ts";
import { fixedOf, stopVscode, VscodeSession } from "./vscode.ts";

const mediaRoot = join(checkoutRoot, "apps", "site", "media");
const rel = (name: string) => relative(checkoutRoot, name);

export type RecordOptions = {
  /** Only the terminal's media or only VS Code's; both when left out. */
  harness?: "terminal" | "vscode";
  /** Scenarios of one package at once, in place of 2. */
  jobs?: number;
};

/** Records `name` (a package, `kit` or `apps`), or every package. Returns how many failed. */
export async function record(name: string | undefined, o: RecordOptions = {}): Promise<number> {
  const packages = packagesNamed(name);
  // Named on purpose: a package with nothing to record is a mistake; among all of them it is not.
  const only = name !== undefined && packages.length === 1;
  let bad = 0;
  for (const p of packages) {
    try {
      if (p.name.startsWith("kit-")) {
        if (o.harness !== "vscode") await recordKit(p, only);
        if (o.harness !== "terminal") await recordVscode(p, only, o.harness === "vscode");
      } else {
        if (o.harness !== "vscode") await recordTerminal(p, o, only);
        if (o.harness !== "terminal") await recordVscode(p, only, o.harness === "vscode");
      }
    } catch (err) {
      bad++;
      console.error(`record: ${p.name}: ${(err as Error).message}`);
    }
  }
  return bad;
}

const siteFile = (p: E2EPackage) => join(p.e2e, "site.scenarios.ts");

// ---- a package's folder

/** Publishes a staged run into the package's folder, leaving the other recorder's files alone. */
function commit(pkg: string, stage: string, mine: (file: string) => boolean) {
  const dest = join(mediaRoot, pkg);
  publish(dest, stage, mine);
  for (const f of readdirSync(dest))
    if (mine(f)) console.error(`record: ${rel(join(dest, f))} ${kb(join(dest, f))}`);
}

// ---- terminal

/**
 * tui-test encodes a recording with the `ffmpeg` on PATH. Without one, builds nixpkgs' and puts a
 * wrapper first on PATH that clears LD_LIBRARY_PATH, which a dev shell may point at libraries of
 * another glibc.
 */
function ensureFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return;
  } catch {
    /* none, or one that does not run: use nixpkgs' */
  }
  const out = execFileSync(
    "nix",
    [
      "build",
      "--no-link",
      "--print-out-paths",
      "--inputs-from",
      checkoutRoot,
      "nixpkgs#ffmpeg-headless",
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")[0]!;
  const bin = mkdtempSync(join(tmpdir(), "site-bin-"));
  const wrapper = join(bin, "ffmpeg");
  writeFileSync(wrapper, `#!/bin/sh\nunset LD_LIBRARY_PATH\nexec ${out}/bin/ffmpeg "$@"\n`, {
    mode: 0o755,
  });
  process.env.PATH = `${bin}:${process.env.PATH}`;
}

type Still = {
  png: string;
  caption: string;
  harness: "claude" | "pi";
  width: number;
  height: number;
};
type Video = {
  mp4: string;
  poster: string;
  caption: string;
  harness: "claude" | "pi";
  width: number;
  height: number;
};
type Media = { videos: Video[]; stills: Still[] };

/**
 * Plays one scenario's agent to its steps and shoots its last screen as `<file>.png`; a demo
 * (`record`) is recorded as `<file>.mp4` too, with `<file>.png` as its poster.
 */
async function play1(
  set: SiteSet,
  name: string,
  harness: "claude" | "pi",
  out: string,
  record: false | string,
) {
  const r = resolveScenario(asSet(set, harness), name);
  const demo = demosOf(set).find((d) => d.harness === harness)?.demo;
  const scenario = record ? demo : set.stills[name];
  const kitty = scenario?.capture === "kitty";
  // Under /tmp so the folder shows in the agent's header without a user's home in it.
  const runDir = mkdtempSync("/tmp/s-");
  const session = await Session.open({
    harness,
    start: r.start,
    setup: r.setup,
    size: r.size,
    backend: "daemon",
    name: `site-${set.plugin}-${record || name}`,
    runDir,
    project: scenario?.project ?? "app",
  });
  const look = { zoom: ZOOM };
  try {
    if (kitty) {
      const prefix = join(out, record || name);
      const cast = `${prefix}.cast`;
      if (record) {
        await play(session, demo?.prepare ?? []);
        await session.waitHintsGone();
        await session.settle();
      }
      await session.record(cast);
      try {
        await play(session, record ? pace(r.steps, `${set.plugin}/${record}`) : r.steps);
        if (!record) await session.waitHintsGone();
        await session.settle();
      } finally {
        await session.stopRecording();
      }
      // A process of its own: the capture blocks on Kitty, and the other scenarios run meanwhile.
      await promisify(execFile)(process.execPath, [
        join(import.meta.dirname, "..", "drive.ts"),
        "cast",
        "--require-graphics",
        cast,
        prefix,
      ]);
      if (!record) rmSync(`${prefix}.mp4`);
      rmSync(cast);
    } else if (record) {
      await play(session, demo?.prepare ?? []);
      await session.waitHintsGone();
      await session.settle();
      const mp4 = join(out, `${record}.mp4`);
      session.poster = { path: join(out, `${record}.png`), opts: look };
      await session.record(mp4, {
        zoom: VIDEO_ZOOM,
        fps: FPS,
        idleTimeLimit: IDLE,
      });
      try {
        await play(session, pace(r.steps, `${set.plugin}/${record}`));
        await session.settle();
      } finally {
        await session.stopRecording();
      }
      if (!existsSync(join(out, `${record}.png`)))
        await session.png(join(out, `${record}.png`), look);
    } else {
      await play(session, r.steps);
      await session.waitHintsGone();
      await session.settle();
      await session.png(join(out, `${name}.png`), look);
    }
    // The fake Linear server only records a write; a scenario that made one filed an issue on screen.
    if (existsSync(join(runDir, WRITES)))
      throw new Error(`${name} wrote to the fake Linear server`);
  } catch (err) {
    await session.png(join(out, `${name}@failed.png`), look).catch(() => undefined);
    throw err;
  } finally {
    await session.close();
    // A failed screen's run folder is kept and named with `--keep`, as every other run's.
    if (options.keep) console.error(`kept the run folder: ${runDir}`);
    else rmSync(runDir, { recursive: true, force: true });
  }
}

/** Pool of `n` workers over `jobs`. */
async function pool<T>(jobs: (() => Promise<T>)[], n: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = Array.from({ length: jobs.length });
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        results[i] = await jobs[i]!().then(
          (value) => ({ status: "fulfilled", value }) as const,
          (reason) => ({ status: "rejected", reason }) as const,
        );
      }
    }),
  );
  return results;
}

async function recordTerminal(p: E2EPackage, o: RecordOptions, named: boolean) {
  const file = siteFile(p);
  if (!existsSync(file)) {
    if (named) throw new Error(`no site.scenarios.ts in ${p.name}'s e2e folder`);
    return;
  }
  const plugin = p.name;
  const set = (await loadSet(file)) as unknown as SiteSet;
  const supported = (scenario: { capture?: "kitty" }) =>
    scenario.capture !== "kitty" || process.platform === "linux";
  const demos = demosOf(set).filter(({ demo }) => supported(demo));
  const stills = Object.entries(set.stills).filter(([, s]) => supported(s));
  if (demos.length === 0 && stills.length === 0) {
    console.error(`record: ${plugin}: Kitty capture requires Linux, skipping`);
    return;
  }
  ensureFfmpeg();
  const stage = mkdtempSync(join(tmpdir(), `site-${plugin}-`));
  type Job = { name: string; harness: "claude" | "pi"; record: false | string };
  const jobs: Job[] = [];
  for (const d of demos) jobs.push({ name: "demo", harness: d.harness, record: d.base });
  for (const [name, s] of stills)
    jobs.push({ name, harness: s.harness ?? "claude", record: false });

  const results = await pool(
    jobs.map((j) => async () => {
      const t = Date.now();
      await play1(set, j.name, j.harness, stage, j.record);
      console.error(
        `record: ${plugin}/${j.record || j.name} ${((Date.now() - t) / 1000).toFixed(0)}s`,
      );
    }),
    o.jobs ?? 2,
  );
  const failed = results.flatMap((r, i) =>
    r.status === "rejected" ? [{ job: jobs[i]!, why: r.reason }] : [],
  );
  if (failed.length > 0) {
    for (const f of failed)
      console.error(
        `record: ${plugin}/${f.job.record || f.job.name} failed: ${String((f.why as Error).message ?? f.why).slice(0, 1500)}`,
      );
    console.error(`record: ${plugin}: kept the old media`);
    throw retainFailure(stage, `${failed.length} scenario(s) failed`);
  }

  const relPath = (name: string) => `apps/site/media/${plugin}/${name}`;
  const media: Media = { videos: [], stills: [] };
  for (const d of demos) {
    squeeze(join(stage, `${d.base}.png`), BUDGET.png);
    squeeze(join(stage, `${d.base}.mp4`), BUDGET.mp4);
    media.videos.push({
      mp4: relPath(`${d.base}.mp4`),
      poster: relPath(`${d.base}.png`),
      caption: d.demo.caption,
      harness: d.harness,
      ...pngSize(join(stage, `${d.base}.png`)),
    });
  }
  for (const [name, s] of stills) {
    squeeze(join(stage, `${name}.png`), BUDGET.png);
    media.stills.push({
      png: relPath(`${name}.png`),
      caption: s.caption,
      harness: s.harness ?? "claude",
      ...pngSize(join(stage, `${name}.png`)),
    });
  }
  writeFileSync(join(stage, "media.json"), `${JSON.stringify(media, null, 2)}\n`);
  // The VS Code pictures share the folder and stay.
  commit(plugin, stage, (f) => !isVscodeFile(f));
}

// ---- VS Code

type VscodeStill = {
  png: string;
  caption: string;
  harness: "claude";
  surface: "vscode";
  width: number;
  height: number;
};

/** The window of a run folder, photographed whole: what a failed step left on screen. */
async function failedShot(runDir: string, file: string) {
  try {
    const session = await VscodeSession.attach(runDir);
    await session.shot(file);
    session.close();
  } catch {
    /* no window to photograph */
  }
}

/**
 * A kit package's pictures: each graphical story of its `vscode.scenarios.ts` at the window's size
 * and again at a phone pane's width (the narrow layout the house rules cap).
 */
const kitPictures = (set: VscodeSet): [string, SiteVscode][] =>
  Object.entries(set.scenarios).flatMap(([id, s]): [string, SiteVscode][] => {
    const name = id.replace("/", "-");
    const about = s.about ?? id;
    return [
      [name, { caption: about, scenario: id }],
      [
        `${name}-narrow`,
        { caption: `${about}, in a narrow pane`, scenario: id, steps: [{ resize: [420, 800] }] },
      ],
    ];
  });

async function recordVscode(p: E2EPackage, named: boolean, asked: boolean) {
  const kit = p.name.startsWith("kit-");
  const site = siteFile(p);
  const vscodeFile = join(p.e2e, "vscode.scenarios.ts");
  if (!existsSync(vscodeFile) || (!kit && !existsSync(site))) {
    // A kit package with no VS Code stories is no mistake unless its VS Code pictures were asked for.
    if (named && (!kit || asked))
      throw new Error(
        kit
          ? `no vscode.scenarios.ts in ${p.name}'s e2e folder`
          : `no site.scenarios.ts and vscode.scenarios.ts in ${p.name}'s e2e folder`,
      );
    return;
  }
  const plugin = p.name;
  // A kit package keeps its media in a folder of its own, under `kit/`.
  const folder = kit ? `kit/${kitFolder(p)}` : plugin;
  const scenarios = await loadVscodeSet(vscodeFile);
  const pictures = kit
    ? kitPictures(scenarios)
    : Object.entries(((await loadSet(site)) as unknown as SiteSet).vscode ?? {});
  if (pictures.length === 0) return;
  if (process.platform !== "linux") {
    // Asked for by `--harness vscode` (the `media:vscode` task), a skip would be a success with no
    // pictures, which turbo caches as the task's result; a recording of both is just short of them.
    if (asked) throw new Error("VS Code pictures need a Linux compositor");
    console.error(`record: ${plugin}: VS Code pictures need a Linux compositor, skipped`);
    return;
  }
  const stage = mkdtempSync(join(tmpdir(), `site-vscode-${plugin}-`));
  // A window per start that its environment fixes (`fixedOf`): a picture whose scenario starts
  // like the last one's is a new tab in the same window, which takes half as long.
  let window: { runDir: string; fixed: string } | undefined;
  const close = async () => {
    if (!window) return;
    await stopVscode(window.runDir);
    if (!options.keep) rmSync(window.runDir, { recursive: true, force: true });
    window = undefined;
  };
  let name = "";
  try {
    for (const [n, pic] of pictures) {
      name = n;
      const t = Date.now();
      const r = resolveVscode(scenarios, pic.scenario);
      r.steps = [...r.steps, ...(pic.steps ?? [])];
      r.size = VSCODE_SIZE;
      const fresh = async () => {
        await close();
        // Under /tmp, as the terminal's: the folder is named nowhere a person's home shows.
        window = { runDir: mkdtempSync("/tmp/s-"), fixed: fixedOf(r.start) };
        return (await reachVscode(r, window.runDir)).session;
      };
      const png = join(stage, `vscode-${name}.png`);
      const reloaded = window?.fixed === fixedOf(r.start);
      // The first capture is the picture kept: a tab that left a mod's pictures undrawn fails it,
      // rather than being tried again in a window that would draw them.
      await photograph(async () => {
        const session = reloaded ? await reloadVscode(r, window!.runDir) : await fresh();
        return {
          shot: (file) => session.shot(file, { panel: true }),
          undrawn: () => session.undrawn(),
          close: () => session.close(),
        };
      }, png);
      console.error(`record: ${plugin}/vscode-${name} ${((Date.now() - t) / 1000).toFixed(0)}s`);
    }
  } catch (err) {
    if (window) await failedShot(window.runDir, join(stage, `vscode-${name}@failed.png`));
    console.error(
      `record: ${plugin}/vscode-${name} failed: ${String((err as Error).message ?? err).slice(0, 1500)}`,
    );
    console.error(`record: ${plugin}: kept the old pictures`);
    throw retainFailure(stage, `${name} failed`);
  } finally {
    await close();
  }

  optimise(pictures.map(([n]) => join(stage, `vscode-${n}.png`)));
  const stills: VscodeStill[] = pictures.map(([n, pic]) => {
    const png = join(stage, `vscode-${n}.png`);
    squeeze(png, BUDGET.png);
    return {
      png: `apps/site/media/${folder}/vscode-${n}.png`,
      caption: pic.caption,
      harness: "claude",
      surface: "vscode",
      ...pngSize(png),
    };
  });
  writeFileSync(join(stage, VSCODE_MANIFEST), `${JSON.stringify({ stills }, null, 2)}\n`);
  // The terminal's media share the folder and stay.
  commit(folder, stage, isVscodeFile);
}

// ---- a kit package

/** A kit package's folder under `apps/site/media/kit/`: `kit-card` writes `card/`. */
const kitFolder = (p: E2EPackage) => p.name.slice("kit-".length);

/** A kit story's picture, keyed `<harness>/<story>@<w>x<h>` in `crops.json`; `png` is repo-relative. */
type Crop = { png: string; width: number; height: number; hash: string };

/**
 * Plays the package's stories, taking each screen as it is now, and keeps each one's region: the
 * site shows the component and not the terminal round it. No stored snapshot and no test flag has
 * a say in whether a story is recorded; a step or capture that fails still fails the recording.
 */
async function recordKit(p: E2EPackage, named: boolean) {
  const files = entries(p.name, ["claude", "pi"]);
  if (files.length === 0) {
    if (named) throw new Error(`${p.name} has no claude or pi scenarios`);
    return;
  }
  // The stories load the catalogue's build, which `pnpm turbo run build` writes.
  if (!existsSync(join(checkoutRoot, "lib/kits/catalog/dist/.claude-plugin/plugin.json")))
    throw new Error(
      "the catalogue is not built; run `pnpm turbo run build --filter=@agents/kit-catalog`",
    );

  const sets: ScenarioSet[] = [];
  for (const f of files) sets.push(await loadSet(f.file));
  const { outcomes } = await runAll(sets, () => true, { ...realStage, capture: captureMedia });

  const stage = mkdtempSync(join(tmpdir(), `site-${p.name}-`));
  const crops: Record<string, Crop> = {};
  const written: string[] = [];
  const failures: string[] = [];
  const actuals: string[] = [];
  for (const [key, outcome] of outcomes) {
    if (outcome.error) {
      failures.push(`${key}: ${outcome.error.message.split("\n")[0]}`);
      continue;
    }
    // `<package>/<harness>/<scenario>`, and a kit scenario is named `<component>/<story>`.
    const [, harness, ...named] = key.split("/") as [string, string, ...string[]];
    const story = named.join("/");
    for (const c of outcome.captures) {
      const shot = actualOf(c.png);
      if (!existsSync(shot)) continue;
      actuals.push(shot);
      const [cols, rows] = c.size;
      const cut = cropToRegion(readFileSync(shot), c.actual.split("\n", 1)[0]!, cols, rows);
      if (!cut) {
        console.error(
          `record: ${p.name}/${story}@${cols}x${rows} is not a ${cols}x${rows} window; skipped`,
        );
        continue;
      }
      const name = `${harness}/${story}@${cols}x${rows}`;
      const out = join(stage, `${name}.png`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, cut.png);
      written.push(out);
      crops[name] = {
        png: `apps/site/media/kit/${kitFolder(p)}/${name}.png`,
        width: cut.width,
        height: cut.height,
        hash: cut.hash,
      };
    }
  }
  if (failures.length > 0) {
    // The screenshots the stories that did play left stay in their scenario folders as evidence,
    // beside the stage that holds the crops made before the failure.
    console.error(`record: ${p.name}: kept the old pictures`);
    throw retainFailure(
      stage,
      `${failures.length} scenario(s) failed:\n- ${failures.join("\n- ")}`,
    );
  }
  for (const shot of actuals) rmSync(shot, { force: true });
  optimise(written);
  for (const f of written)
    if (statSync(f).size > BUDGET.png)
      console.error(`record: ${rel(f)} is ${kb(f)}, over its ${BUDGET.png / 1024} KB budget`);
  // The site's loader joins every package's `crops.json`; the VS Code pictures share the folder.
  const sorted = Object.fromEntries(Object.entries(crops).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join(stage, "crops.json"), `${JSON.stringify(sorted, null, 2)}\n`);
  const dest = join(mediaRoot, "kit", kitFolder(p));
  const mine = (f: string) => !isVscodeFile(f);
  publish(dest, stage, mine);
  for (const f of readdirSync(dest))
    if (mine(f)) console.error(`record: ${rel(join(dest, f))} ${kb(join(dest, f))}`);
}
