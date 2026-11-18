import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { scenarios, type Scenario } from "../lib/scenario.ts";
import { gridLines } from "../lib/screen.ts";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAYAAAA5DDySAAAAdklEQVR42u3ZsRGAIAwFUIZxAAtHsLO2ZyVXYyHcAAu5Q8wrfpm78JrkQtqOXFtZ1r2Z2esTAAAAAAAAEBjg7w98qgfQo4FyncMCAAAAAADeAPQYMyMBPrEJAgAAAAAAAJMC2AQBAHARAgAAQFwAP0MAAIQGuAEhKJcojry0RgAAAABJRU5ErkJggg==";
const input = { file_path: "" };

/** Stops after the assistant's reply, before Claude's random completion verb and the prompt. */
const throughPreview: Scenario["region"] = (grid) => {
  const last = gridLines(grid).findIndex((line) => line.includes("preview ready"));
  return { x: 0, y: 0, w: grid[0]?.length ?? 0, h: last < 0 ? grid.length : last + 1 };
};

export default scenarios({
  plugin: "image-preview",
  harness: "claude",
  region: throughPreview,
  scenarios: {
    read: {
      about: "a PNG returned by Read, with a long escaped path and wide characters",
      setup: (ctx) => {
        const path = join(
          ctx.cwd,
          "a-very-long-directory-name/with-several-levels/picture#1-日本語.png",
        );
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, Buffer.from(PNG, "base64"));
        input.file_path = path;
      },
      start: {
        hermetic: true,
        plugins: ["image-preview"],
        // Identify the Ghostty backend. Its libghostty probe currently reports kittyGraphics=no,
        // so these screenshots exercise Image's alt fallback; plugin tests check the picture boxes.
        env: { TERM: "xterm-ghostty", TERM_PROGRAM: "ghostty" },
        turns: [{ toolCall: { name: "Read", arguments: input } }, { text: "preview ready" }],
      },
      steps: [{ type: "show the preview" }, { press: "Enter" }, { wait: "preview ready" }],
      mask: [{ pattern: /[A-Za-z0-9]{5}(?=\/cwd\/a-very-long-directory-name)/g, with: "<run>" }],
      extreme: true,
    },
  },
});
