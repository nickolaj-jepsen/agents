/**
 * Crops each kit scenario's screenshot (each kit package's `e2e/__snapshots__/`, git-ignored) to the scenario's
 * region (the `@x,y (wxh)` of its `.snap` header), so the site shows the component and not the
 * terminal round it, and writes them under `apps/site/media/kit/`, listed in `crops.json` with a
 * pixel size and a hash: an unchanged crop is not rewritten, so a run leaves no churn. The cutting
 * itself is the driver's (`lib/crop.ts`), which `drive record kit-<name>` uses too.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { cropToRegion } from "@agents/drive/lib/crop.ts";
import { repoRoot, snapshotRoots } from "./model.ts";
import { harnesses } from "@agents/kit-core/manifest.ts";

const repo = repoRoot;
export const cropsDir = join(repo, "apps/site/media/kit");
export const cropsFile = join(cropsDir, "crops.json");
/** The most bytes one picture may take before the run warns. */
const BUDGET = 300_000;

/** Keyed `<harness>/<story>@<w>x<h>`; `png` is repo-relative. */
export type Crop = { png: string; width: number; height: number; hash: string };
export type Crops = Record<string, Crop>;

export function readCrops(): Crops {
  return existsSync(cropsFile) ? (JSON.parse(readFileSync(cropsFile, "utf8")) as Crops) : {};
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** pngquant then oxipng over the files, from PATH or, failing that, from nixpkgs. */
function optimise(files: string[]): void {
  if (files.length === 0) return;
  const onPath = (tool: string) => spawnSync("sh", ["-c", `command -v ${tool}`]).status === 0;
  const script = [
    // Terminal pictures hold few colours; a palette keeps the text crisp at a fraction of the size.
    // 98 and 99: a file pngquant left as it was (no smaller, or not at that quality).
    'pngquant --quality 85-100 --speed 1 --strip --skip-if-larger --force --ext .png -- "$@"; s=$?',
    '{ [ $s -eq 0 ] || [ $s -eq 98 ] || [ $s -eq 99 ]; } && oxipng --quiet --opt 4 --strip safe -- "$@"',
  ].join("; ");
  const args = ["-c", script, "sh", ...files];
  const run =
    onPath("pngquant") && onPath("oxipng")
      ? spawnSync("sh", args, { stdio: "inherit" })
      : spawnSync(
          "nix",
          ["shell", "nixpkgs#pngquant", "nixpkgs#oxipng", "--command", "sh", ...args],
          { stdio: "inherit" },
        );
  if (run.status !== 0) console.warn("catalog: optimising the crops failed; they stay as written");
}

/**
 * Crops every screenshot there is into `apps/site/media/kit/` and rewrites `crops.json`. Crops of a
 * harness with screenshots this run that no longer has one are removed; a harness with none
 * keeps the crops it has (a fresh checkout).
 */
export function cropShots(): { written: number; kept: number; removed: number } {
  const before = readCrops();
  const after: Crops = {};
  const changed: string[] = [];
  const ran = new Set<string>();
  for (const harness of harnesses) {
    for (const root of snapshotRoots(harness))
      for (const full of walk(root)) {
        const m = /^(.+\/[^/]+)@(\d+)x(\d+)\.png$/.exec(relative(root, full));
        if (!m) continue;
        ran.add(harness);
        const [, story, w, h] = m as unknown as [string, string, string, string];
        const snap = full.replace(/\.png$/, ".snap");
        if (!existsSync(snap)) continue;
        const cols = Number(w);
        const rows = Number(h);
        const cut = cropToRegion(
          readFileSync(full),
          readFileSync(snap, "utf8").split("\n", 1)[0]!,
          cols,
          rows,
        );
        if (!cut) {
          console.warn(`catalog: ${relative(repo, full)} is not a ${cols}x${rows} window; skipped`);
          continue;
        }
        const key = `${harness}/${story}@${cols}x${rows}`;
        const out = join(cropsDir, `${key}.png`);
        const hash = cut.hash;
        after[key] = { png: relative(repo, out), width: cut.width, height: cut.height, hash };
        if (before[key]?.hash === hash && existsSync(out)) continue;
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, cut.png);
        changed.push(out);
      }
  }
  // A harness that drew nothing this run keeps what it had.
  for (const [key, c] of Object.entries(before))
    if (!ran.has(key.split("/", 1)[0]!) && !(key in after)) after[key] = c;
  let removed = 0;
  for (const [key, c] of Object.entries(before))
    if (!(key in after)) {
      rmSync(join(repo, c.png), { force: true });
      removed++;
    }
  optimise(changed);
  for (const f of changed)
    if (statSync(f).size > BUDGET)
      console.warn(`catalog: ${relative(repo, f)} is ${statSync(f).size} bytes, over ${BUDGET}`);
  const sorted = Object.fromEntries(Object.entries(after).sort(([a], [b]) => a.localeCompare(b)));
  mkdirSync(cropsDir, { recursive: true });
  writeFileSync(cropsFile, JSON.stringify(sorted, null, 2) + "\n");
  return { written: changed.length, kept: Object.keys(after).length - changed.length, removed };
}
