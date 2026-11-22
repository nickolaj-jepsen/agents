/**
 * The pi kit's catalogue: a scenario per story of the dev-only catalogue; its snapshots and PNGs
 * feed `turbo run catalog`. Each kit package plays the stories of its own components
 * (`<package>/e2e/pi.scenarios.ts`), the catalogue those of the legacy kit, all against the
 * catalogue's build.
 */
import { fileURLToPath } from "node:url";
import { STAGE_AT, stageRows, stageWidth } from "../pi/stage.ts";
import { storyId, stories, type Story } from "../pi/stories.ts";
import { region } from "@agents/drive/lib/screen.ts";
import { catalogueSizes } from "@agents/drive/lib/kit-sizes.ts";
import { scenarios, type Scenario } from "@agents/drive/lib/scenario.ts";
import type { Region } from "@agents/drive/lib/screen.ts";

/** The catalogue extension, built (`pnpm turbo run build`). */
const catalog = fileURLToPath(new URL("../../dist", import.meta.url));

const plain = {
  fg: (_c: string, t: string) => t,
  bold: (t: string) => t,
  underline: (t: string) => t,
} as never;

/**
 * A frame story is the frame itself: its box. Any other is drawn on the stage, a known
 * rectangle: the story's width on this terminal by the rows it renders.
 */
const regionOf =
  (s: Story): Region =>
  (grid) => {
    // A joined band has no bottom border: it runs to the rule it stands on.
    if (s.frame) return region.any(region.box(), region.rows(/^\s*╭─/, /^\s*─{10,}\s*$/))(grid);
    const columns = grid[0]?.length ?? 0;
    const rows = grid.length;
    const w = stageWidth(s, columns);
    const lines = s.make().render(plain, w, { columns, rows });
    return { x: STAGE_AT.col, y: STAGE_AT.row, w, h: Math.min(lines.length, stageRows(rows)) };
  };

/** The scenarios of `plugin` (`kit-<name>`): the stories whose component `owns` says is its. */
export const piScenarios = (plugin: string, owns: (component: string) => boolean) =>
  scenarios({
  plugin,
  harness: "pi",
  scenarios: Object.fromEntries(
    stories.filter((s) => owns(s.component)).map((s): [string, Scenario] => [
      storyId(s),
      {
        about: s.about,
        region: regionOf(s),
        // Hermetic, on the replay provider: the same screen signed out (the Pages workflow) as here.
        start: { hermetic: true, turns: [], args: ["--extension", catalog] },
        steps: [
          { type: `/kit ${s.component} ${s.state}` },
          { press: "Enter" },
          s.frame ? { wait: /esc (close|later)/ } : { sleep: 600 },
        ],
        // Esc closes the story, leaving the prompt the next one starts from.
        reset: [{ press: "Escape" }],
        sizes: catalogueSizes(s.extreme ?? false),
      },
    ]),
  ),
});
