/**
 * The Claude kit's catalogue: one scenario per story in kit/catalog/claude/stories.ts, named
 * `<component>/<state>`. A story is drawn by the dev-only catalogue mod, loaded with
 * `--plugin-dir`; its snapshot is cropped to the component alone.
 */
import { fileURLToPath } from "node:url";
import { stageWidth, storyId, stories, type Story } from "../../kit/catalog/claude/stories.ts";
import { gridLines, region, rowText } from "../lib/screen.ts";
import type { Rect, Region } from "../lib/screen.ts";
import { catalogueSizes } from "./sizes.ts";
import { scenarios, type Scenario, type Step } from "../lib/scenario.ts";

const catalog = fileURLToPath(new URL("../../kit/catalog/claude", import.meta.url));

/** Rows to the last one with text in them, so the crop ends where the component does. */
const trimmed = (grid: Parameters<Region>[0], r: Rect): Rect => {
  let bottom = r.y + r.h - 1;
  while (bottom > r.y && rowText(grid[bottom]?.slice(r.x, r.x + r.w) ?? []).text.trim() === "")
    bottom--;
  return { ...r, h: bottom - r.y + 1 };
};

/**
 * A pane's body, inside the engine's frame: from 110 columns the docked column (its `│` edge,
 * the close mark on the top row), else the box over the transcript with its own cell of
 * padding. Cut to the story's width and to where its rows end.
 */
const paneBody =
  (s: Story): Region =>
  (grid) => {
    const dock = region.sidebar(grid);
    const box = dock ? undefined : region.box()(grid);
    const inner: Rect | undefined = dock
      ? { x: dock.x + 1, y: dock.y + 1, w: dock.w - 1, h: dock.h - 1 }
      : box && { x: box.x + 2, y: box.y + 1, w: box.w - 4, h: box.h - 2 };
    if (!inner) return undefined;
    return trimmed(grid, { ...inner, w: stageWidth(s, inner.w) });
  };

/**
 * The band: from its divider (`── title ──`) down to the row before the prompt's rule, less
 * the engine's hints.
 */
const band: Region = (grid) => {
  const lines = gridLines(grid);
  const top = lines.findIndex((l) => /^──\s+\S/.test(l));
  if (top < 0) return undefined;
  let bottom = lines.findIndex((l, i) => i > top && /^─+$/.test(l)) - 1;
  if (bottom < top) bottom = lines.length - 1;
  while (bottom > top && /^$|tmux|ctrl\+g to edit|\/effort|focus-events/.test(lines[bottom] ?? ""))
    bottom--;
  return { x: 0, y: top, w: grid[0]?.length ?? 0, h: bottom - top + 1 };
};

/**
 * The catalogue mod loads after the prompt shows, and a command typed before it is lost. Typing
 * `/kit` lists the command in the slash menu once it is registered, so that is what this waits for.
 */
const modLoaded: Step = {
  run: async (session) => {
    for (let tries = 0; tries < 40; tries++) {
      await session.type("/kit", { settle: false });
      try {
        await session.wait(/\/kit\s+\S*.*Draw a Claude/, { timeout: 750 });
        return;
      } catch {
        await session.press(["Backspace", "Backspace", "Backspace", "Backspace"], {
          settle: false,
        });
      }
    }
    throw new Error("the catalogue mod never registered /kit");
  },
};

export default scenarios({
  plugin: "kit",
  harness: "claude",
  scenarios: Object.fromEntries(
    stories.map((s): [string, Scenario] => [
      storyId(s),
      {
        about: s.about,
        region: s.surface === "band" ? band : paneBody(s),
        // The model is pinned, or the account's default (and the status rows it brings) leaks into a snapshot.
        start: { args: ["--model", "haiku", "--plugin-dir", catalog] },
        // The catalogue mod loads after the prompt shows: a command typed first is lost.
        steps: [
          modLoaded,
          { type: ` ${s.component} ${s.state}` },
          { press: "Enter" },
          { wait: `Drew ${storyId(s)}`, timeout: 15000 },
        ],
        // `/kit` alone clears the stage, which is the screen the next story starts from.
        reset: [{ type: "/kit" }, { press: "Enter" }],
        sizes: catalogueSizes(s.extreme ?? false),
      },
    ]),
  ),
});
