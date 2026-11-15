/**
 * The pi kit's catalogue: one scenario per story in kit/catalog/pi/stories.ts, named
 * `<component>/<state>`. Snapshots and PNGs feed `npm run catalog`.
 */
import { fileURLToPath } from "node:url";
import { STAGE_AT, stageRows, stageWidth } from "../../kit/catalog/pi/stage.ts";
import { storyId, stories, type Story } from "../../kit/catalog/pi/stories.ts";
import { region } from "../lib/screen.ts";
import { catalogueSizes } from "./sizes.ts";
import { scenarios, type Scenario } from "../lib/scenario.ts";
import type { Region } from "../lib/screen.ts";

const catalog = fileURLToPath(new URL("../../kit/catalog/pi/index.ts", import.meta.url));

const plain = { fg: (_c: string, t: string) => t, bold: (t: string) => t } as never;

/**
 * A frame story is the frame itself: its box. Any other is drawn on the stage, a known
 * rectangle: the story's width on this terminal by the rows it renders.
 */
const regionOf =
  (s: Story): Region =>
  (grid) => {
    if (s.frame) return region.box()(grid);
    const columns = grid[0]?.length ?? 0;
    const rows = grid.length;
    const w = stageWidth(s, columns);
    const lines = s.make().render(plain, w, { columns, rows });
    return { x: STAGE_AT.col, y: STAGE_AT.row, w, h: Math.min(lines.length, stageRows(rows)) };
  };

export default scenarios({
  plugin: "kit",
  harness: "pi",
  scenarios: Object.fromEntries(
    stories.map((s): [string, Scenario] => [
      storyId(s),
      {
        about: s.about,
        region: regionOf(s),
        start: { args: ["--extension", catalog] },
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
