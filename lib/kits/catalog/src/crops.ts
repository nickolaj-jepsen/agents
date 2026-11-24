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

/** A graphical client's pane: docked beside a wide window, or above the prompt of a narrow one. */
export type Layout = "wide" | "narrow";
/** A story's picture in VS Code, cut to the catalogue's pane; `png` is repo-relative. */
export type Picture = { png: string; width: number; height: number };
/** Keyed by story (`<component>/<state>`). */
export type Pictures = Record<string, Partial<Record<Layout, Picture>>>;

/**
 * Every package's VS Code pictures (its `media-vscode.json`, which `media:vscode` writes beside the
 * crops), by story. A picture recorded before the manifest named its story is left out.
 */
export function readPictures(): Pictures {
  if (!existsSync(cropsDir)) return {};
  const out: Pictures = {};
  for (const d of readdirSync(cropsDir, { withFileTypes: true })) {
    const file = join(cropsDir, d.name, "media-vscode.json");
    if (!d.isDirectory() || !existsSync(file)) continue;
    const { stills } = JSON.parse(readFileSync(file, "utf8")) as {
      stills: (Picture & { story?: string; layout?: Layout })[];
    };
    for (const { story, layout, png, width, height } of stills)
      if (story && layout) (out[story] ??= {})[layout] = { png, width, height };
  }
  return out;
}
