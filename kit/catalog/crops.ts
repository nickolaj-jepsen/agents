/**
 * Crops each e2e screenshot to the scenario's region (the `@x,y (wxh)` of its `.snap` header)
 * so the page shows the component and not the terminal round it.
 *
 * tui-test's screenshot is a window: purple padding, a title bar, then the cell grid, at a
 * fixed cell size. The geometry below was read off those images; a screenshot whose size does
 * not match it for its grid is left uncropped rather than cropped wrong.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { crop, decode, encode } from "./png.ts";
import { here, type Model } from "./model.ts";

const cell = { w: 10, h: 21 };
const origin = { x: 39, y: 65 };
const margin = { right: 39, bottom: 39 };

/** Fills `shot.crop` (a path relative to the page) for every screenshot it can crop. */
export function cropShots(model: Model): void {
  for (const c of model.components)
    for (const s of c.stories)
      for (const [harness, own] of Object.entries(s.by)) {
        for (const shot of own?.shots ?? []) {
          const full = join(here, shot.src);
          const snap = full.replace(/\.png$/, ".snap");
          if (!existsSync(snap)) continue;
          const m = /@(\d+),(\d+) \((\d+)x(\d+)\)/.exec(
            readFileSync(snap, "utf8").split("\n", 1)[0]!,
          );
          if (!m) continue;
          const rel = join("crops", harness, `${s.id}@${shot.w}x${shot.h}.png`);
          const out = join(here, rel);
          if (!existsSync(out) || statSync(out).mtimeMs < statSync(full).mtimeMs) {
            const img = decode(readFileSync(full));
            if (
              img.w !== origin.x + cell.w * shot.w + margin.right ||
              img.h !== origin.y + cell.h * shot.h + margin.bottom
            )
              continue;
            const x0 = Math.max(0, Number(m[1]));
            const y0 = Math.max(0, Number(m[2]));
            const x1 = Math.min(shot.w, Number(m[1]) + Number(m[3]));
            const y1 = Math.min(shot.h, Number(m[2]) + Number(m[4]));
            mkdirSync(dirname(out), { recursive: true });
            writeFileSync(
              out,
              encode(
                crop(
                  img,
                  origin.x + x0 * cell.w,
                  origin.y + y0 * cell.h,
                  (x1 - x0) * cell.w,
                  (y1 - y0) * cell.h,
                ),
              ),
            );
          }
          shot.crop = rel;
        }
      }
}
