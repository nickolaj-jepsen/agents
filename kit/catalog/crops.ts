/**
 * Crops each kit scenario's screenshot (`e2e/kit/__snapshots__/<harness>/<story>@<w>x<h>.png`,
 * git-ignored) to the scenario's region (the `@x,y (wxh)` of its `.snap` header), so the site
 * shows the component and not the terminal round it. The crops are committed under
 * `site/media/kit/<harness>/<story>@<w>x<h>.png`, optimised, and listed in
 * `site/media/kit/crops.json` with their pixel size and a hash of their pixels: a crop whose
 * pixels have not changed is not rewritten, so a run leaves no churn.
 *
 * tui-test's screenshot is a window: purple padding, a title bar, then the cell grid, at a
 * fixed cell size. The geometry below was read off those images; a screenshot whose size does
 * not match it for its grid is skipped rather than cropped wrong.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import { crop, decode, encode } from "./png.ts";
import { here } from "./model.ts";
import { harnesses } from "./manifest.ts";

const cell = { w: 10, h: 21 };
const origin = { x: 39, y: 65 };
const margin = { right: 39, bottom: 39 };

const repo = join(here, "..", "..");
const snapshots = join(repo, "e2e/kit/__snapshots__");
export const cropsDir = join(repo, "site/media/kit");
export const cropsFile = join(cropsDir, "crops.json");
/** What the site's media budget allows one picture (scripts/readme.ts checks it). */
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
 * Crops every screenshot there is into `site/media/kit/` and rewrites `crops.json`. Crops of a
 * harness with screenshots this run that no longer has one are removed; a harness with none
 * keeps the crops it has (a fresh checkout, or `--no-shots`).
 */
export function cropShots(): { written: number; kept: number; removed: number } {
  const before = readCrops();
  const after: Crops = {};
  const changed: string[] = [];
  const ran = new Set<string>();
  for (const harness of harnesses) {
    const root = join(snapshots, harness);
    for (const full of walk(root)) {
      const m = /^(.+\/[^/]+)@(\d+)x(\d+)\.png$/.exec(relative(root, full));
      if (!m) continue;
      ran.add(harness);
      const [, story, w, h] = m as unknown as [string, string, string, string];
      const snap = full.replace(/\.png$/, ".snap");
      if (!existsSync(snap)) continue;
      const r = /@(\d+),(\d+) \((\d+)x(\d+)\)/.exec(readFileSync(snap, "utf8").split("\n", 1)[0]!);
      if (!r) continue;
      const cols = Number(w);
      const rows = Number(h);
      const img = decode(readFileSync(full));
      if (
        img.w !== origin.x + cell.w * cols + margin.right ||
        img.h !== origin.y + cell.h * rows + margin.bottom
      ) {
        console.warn(`catalog: ${relative(repo, full)} is not a ${cols}x${rows} window; skipped`);
        continue;
      }
      const x0 = Math.max(0, Number(r[1]));
      const y0 = Math.max(0, Number(r[2]));
      const x1 = Math.min(cols, Number(r[1]) + Number(r[3]));
      const y1 = Math.min(rows, Number(r[2]) + Number(r[4]));
      const cut = crop(
        img,
        origin.x + x0 * cell.w,
        origin.y + y0 * cell.h,
        (x1 - x0) * cell.w,
        (y1 - y0) * cell.h,
      );
      const key = `${harness}/${story}@${cols}x${rows}`;
      const out = join(cropsDir, `${key}.png`);
      const hash = createHash("sha256")
        .update(`${cut.w}x${cut.h}x${cut.channels}`)
        .update(cut.data)
        .digest("hex")
        .slice(0, 16);
      after[key] = { png: relative(repo, out), width: cut.w, height: cut.h, hash };
      if (before[key]?.hash === hash && existsSync(out)) continue;
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, encode(cut));
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
