/**
 * The crops of the kit's stories, which each kit package's `media` task writes under
 * `apps/site/media/kit/<package>/` (`drive record kit-<package>`), each folder listed in its own
 * `crops.json` with a pixel size and a hash. The site's loader reads them joined.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./model.ts";

export const cropsDir = join(repoRoot, "apps/site/media/kit");

/** Keyed `<harness>/<story>@<w>x<h>`; `png` is repo-relative. */
export type Crop = { png: string; width: number; height: number; hash: string };
export type Crops = Record<string, Crop>;

/** Every package's crops, joined. */
export function readCrops(): Crops {
  if (!existsSync(cropsDir)) return {};
  const out: Crops = {};
  for (const d of readdirSync(cropsDir, { withFileTypes: true })) {
    const file = join(cropsDir, d.name, "crops.json");
    if (d.isDirectory() && existsSync(file))
      Object.assign(out, JSON.parse(readFileSync(file, "utf8")) as Crops);
  }
  return out;
}
