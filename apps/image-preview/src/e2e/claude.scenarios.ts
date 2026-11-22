import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { scenarios, type Scenario } from "@agents/drive/lib/scenario.ts";
import { gridLines } from "@agents/drive/lib/screen.ts";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAYAAAA5DDySAAAAdklEQVR42u3ZsRGAIAwFUIZxAAtHsLO2ZyVXYyHcAAu5Q8wrfpm78JrkQtqOXFtZ1r2Z2esTAAAAAAAAEBjg7w98qgfQo4FyncMCAAAAAADeAPQYMyMBPrEJAgAAAAAAAJMC2AQBAHARAgAAQFwAP0MAAIQGuAEhKJcojry0RgAAAABJRU5ErkJggg==";
const input = { file_path: "" };

/** Capture the native summary, assistant reply and its added preview, without the prompt. */
const throughPreview: Scenario["region"] = (grid) => {
  const last = gridLines(grid).findIndex((line) => line.includes("preview ready"));
  const end = gridLines(grid).findIndex((line) => line.includes("[image] result.png"));
  return {
    x: 0,
    y: 0,
    w: grid[0]?.length ?? 0,
    h: end >= 0 ? end + 3 : last < 0 ? grid.length : last + 1,
  };
};

export default scenarios({
  plugin: "image-preview",
  harness: "claude",
  region: throughPreview,
  scenarios: {
    read: {
      about:
        "relative Reads fold to one thumbnail, and a multi-paragraph reply adds only one preview",
      setup: (ctx) => {
        const path = join(
          ctx.cwd,
          "a-very-long-directory-name/with-several-levels/picture#1-日本語.png",
        );
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, Buffer.from(PNG, "base64"));
        input.file_path = relative(ctx.cwd, path);
        writeFileSync(join(ctx.cwd, "result.png"), Buffer.from(PNG, "base64"));
        writeFileSync(join(ctx.cwd, "extra.png"), Buffer.from(PNG, "base64"));
      },
      start: {
        hermetic: true,
        plugins: ["image-preview"],
        args: ["--settings", '{"showTurnDuration":false}'],
        // Identify the Ghostty backend. Its libghostty probe currently reports kittyGraphics=no,
        // so these screenshots exercise Image's alt fallback; plugin tests check the picture boxes.
        env: { TERM: "xterm-ghostty", TERM_PROGRAM: "ghostty" },
        turns: [
          { toolCall: { name: "Read", arguments: input } },
          { toolCall: { name: "Read", arguments: { file_path: "extra.png" } } },
          { text: "preview ready: [result](result.png)\n\n[another](extra.png)" },
        ],
      },
      steps: [
        { type: "show the preview" },
        { press: "Enter" },
        { wait: "[image] result.png" },
        { press: "Ctrl+o" },
        { wait: "[image] extra.png" },
        {
          run: async (s) => {
            const screen = await s.text();
            for (const name of ["picture#1-日本語.png", "extra.png", "result.png"]) {
              if (screen.split(`[image] ${name}`).length !== 2)
                throw new Error(`Expected one preview of ${name}\n${screen}`);
            }
          },
        },
        { press: "Ctrl+o" },
        { wait: "+1 more" },
      ],
      extreme: true,
    },
  },
});
