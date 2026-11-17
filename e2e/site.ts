/**
 * `node e2e/site.ts [plugin...]` (`just site-shots`): plays the site scenarios of each plugin and
 * writes its media under `site/media/<plugin>/`: `demo.mp4` with its poster `demo.png` (and
 * `demo-<harness>.*` for a second harness's demo), a PNG per still, and `media.json` listing them. See "Site media" in e2e/README.md.
 *
 * A plugin whose run fails keeps its old files: the media are staged in a folder of their own and
 * moved in only when every scenario of the plugin came out and fits its budget.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { checkoutRoot } from "./lib/harness.ts";
import { loadSet, play, resolveScenario } from "./lib/scenario.ts";
import {
  asSet,
  BUDGET,
  demosOf,
  FPS,
  IDLE,
  pace,
  siteFiles,
  VIDEO_ZOOM,
  ZOOM,
  type SiteSet,
} from "./lib/site.ts";
import { WRITES } from "./lib/linear-mcp.ts";
import { Session } from "./lib/session.ts";

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

const mediaRoot = join(checkoutRoot, "site", "media");

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

/** A PNG's pixel size, from its header. */
function pngSize(path: string) {
  const head = readFileSync(path).subarray(16, 24);
  return { width: head.readUInt32BE(0), height: head.readUInt32BE(4) };
}

const kb = (path: string) => `${(statSync(path).size / 1024).toFixed(0)} KB`;

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
  const demo = demosOf(set).find((d) => d.harness === harness);
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
    project: (record ? demo?.demo : set.stills[name])?.project ?? "app",
  });
  const look = { zoom: ZOOM };
  try {
    if (record) {
      await play(session, demo?.demo.prepare ?? []);
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
    rmSync(runDir, { recursive: true, force: true });
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

const onPath = (tool: string) => {
  try {
    execFileSync("sh", ["-c", `command -v ${tool}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/** `file` brought under `budget` bytes by a pass of a tool that is not part of the repo's shell, or left as is. */
function squeeze(file: string, budget: number) {
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

async function runPlugin(plugin: string, file: string) {
  const set = (await loadSet(file)) as unknown as SiteSet;
  const stage = mkdtempSync(join(tmpdir(), `site-${plugin}-`));
  type Job = { name: string; harness: "claude" | "pi"; record: false | string };
  const jobs: Job[] = [];
  const demos = demosOf(set);
  for (const d of demos) jobs.push({ name: "demo", harness: d.harness, record: d.base });
  for (const [name, s] of Object.entries(set.stills))
    jobs.push({ name, harness: s.harness ?? "claude", record: false });

  const jobsPerPlugin = Number(process.env.SITE_JOBS ?? 2);
  const results = await pool(
    jobs.map((j) => async () => {
      const t = Date.now();
      await play1(set, j.name, j.harness, stage, j.record);
      console.error(
        `site: ${plugin}/${j.record || j.name} ${((Date.now() - t) / 1000).toFixed(0)}s`,
      );
    }),
    jobsPerPlugin,
  );
  const failed = results.flatMap((r, i) =>
    r.status === "rejected" ? [{ job: jobs[i]!, why: r.reason }] : [],
  );
  if (failed.length > 0) {
    for (const f of failed)
      console.error(
        `site: ${plugin}/${f.job.record || f.job.name} failed: ${String((f.why as Error).message ?? f.why).slice(0, 1500)}`,
      );
    console.error(`site: ${plugin}: kept the old media; the failed screens are in ${stage}`);
    throw new Error(`${plugin}: ${failed.length} scenario(s) failed`);
  }

  const rel = (name: string) => `site/media/${plugin}/${name}`;
  const media: Media = { videos: [], stills: [] };
  for (const d of demos) {
    squeeze(join(stage, `${d.base}.png`), BUDGET.png);
    squeeze(join(stage, `${d.base}.mp4`), BUDGET.mp4);
    media.videos.push({
      mp4: rel(`${d.base}.mp4`),
      poster: rel(`${d.base}.png`),
      caption: d.demo.caption,
      harness: d.harness,
      ...pngSize(join(stage, `${d.base}.png`)),
    });
  }
  for (const [name, s] of Object.entries(set.stills)) {
    squeeze(join(stage, `${name}.png`), BUDGET.png);
    media.stills.push({
      png: rel(`${name}.png`),
      caption: s.caption,
      harness: s.harness ?? "claude",
      ...pngSize(join(stage, `${name}.png`)),
    });
  }
  writeFileSync(join(stage, "media.json"), `${JSON.stringify(media, null, 2)}\n`);

  const dest = join(mediaRoot, plugin);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(stage)) {
    copyFileSync(join(stage, f), join(dest, f));
    console.error(`site: ${rel(f)} ${kb(join(dest, f))}`);
  }
  rmSync(stage, { recursive: true, force: true });
}

ensureFfmpeg();
const only = process.argv.slice(2);
const files = siteFiles(only);
let bad = 0;
for (const { plugin, file } of files) {
  try {
    await runPlugin(plugin, file);
  } catch (err) {
    bad++;
    console.error(`site: ${plugin}: ${(err as Error).message}`);
  }
}
process.exit(bad > 0 ? 1 : 0);
