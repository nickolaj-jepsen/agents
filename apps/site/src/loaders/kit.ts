/**
 * The UI kit's catalogue as a collection of components, read by the catalogue's own model
 * (`lib/kits/catalog/src/model.ts`, which also writes COMPONENTS.md) and joined with the crops of the
 * stories' renders that `turbo run media` leaves in `apps/site/media/kit/`. A render that is not
 * there is warned about, and the page says its story has none yet.
 */
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { Loader } from "astro/loaders";
import { readCrops, type Crops } from "../../../../lib/kits/catalog/src/crops.ts";
import { loadModel, repoRoot } from "../../../../lib/kits/catalog/src/model.ts";
import { put, readAndWatch } from "./sync.ts";

/** One render of a story: the terminal size it was drawn at, and the crop's repo path and pixels. */
export type Render = { w: number; h: number; png: string; width: number; height: number };

/** The renders of a story, by harness: its crops, keyed `<harness>/<story>@<w>x<h>`. */
function rendersOf(crops: Crops, id: string): Record<string, Render[]> {
  const out: Record<string, Render[]> = {};
  for (const [key, c] of Object.entries(crops)) {
    const m = /^([^/]+)\/(.+)@(\d+)x(\d+)$/.exec(key);
    if (!m || m[2] !== id) continue;
    (out[m[1]!] ??= []).push({
      w: Number(m[3]),
      h: Number(m[4]),
      png: c.png,
      width: c.width,
      height: c.height,
    });
  }
  return out;
}

/** The sources of the model: each kit package's `src/` (manifests, stories, the exports it reads) and the crops' list. */
const sources = [/^lib\/kits\/[^/]+\/src\//, /^apps\/site\/media\/kit\/crops\.json$/];

export function kitLoader(): Loader {
  return {
    name: "agents-kit",
    async load(ctx) {
      await readAndWatch(ctx, {
        dirs: [join(repoRoot, "lib/kits"), join(repoRoot, "apps/site/media/kit")],
        relevant: (file) => sources.some((re) => re.test(relative(repoRoot, file))),
        read: async () => {
          const model = await loadModel();
          if (model.problems.length > 0)
            throw new Error(
              `the kit catalogue has ${model.problems.length} problem(s):\n- ${model.problems.join("\n- ")}`,
            );
          const crops = readCrops();
          put(
            ctx,
            new Map(
              model.components.map((c) => [
                c.id,
                {
                  ...c,
                  stories: c.stories.map((s) => ({ ...s, shots: rendersOf(crops, s.id) })),
                },
              ]),
            ),
          );
          for (const [key, c] of Object.entries(crops))
            if (!existsSync(join(repoRoot, c.png)))
              ctx.logger.warn(
                `crops.json lists ${key} at ${c.png}, which is not there (pnpm turbo run media)`,
              );
        },
      });
    },
  };
}
