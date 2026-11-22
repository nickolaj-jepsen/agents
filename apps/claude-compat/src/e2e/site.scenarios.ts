import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Turn } from "@agents/drive/lib/harness.ts";
import type { Step } from "@agents/drive/lib/scenario.ts";
import { poster, site, slow, type SiteScenario } from "@agents/drive/lib/site.ts";

const DRAFT =
  "Refactor the sync worker so a failed upload retries with backoff, and add a test for the fifth failure";
const QUICK = "What does the worker do on a 429?";

const turns: Turn[] = [
  {
    text: "On a `429` it waits `Retry-After` seconds, then retries; after five tries it gives up and reports the upload as failed.",
  },
];

/** The plugin takes ctrl+s, so pi's pickers move their save actions to alt+s. */
const setup: SiteScenario["setup"] = (ctx) => {
  const dir = join(ctx.runDir, "pi-agent");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "keybindings.json"),
    JSON.stringify({
      "app.models.save": "alt+s",
      "app.session.toggleSort": "alt+s",
      "app.thinking.save": "alt+s",
    }),
  );
};

const start = { hermetic: true, plugins: ["claude-compat"], turns };

/** The draft is typed, then put aside with ctrl+s. */
const STASH: Step[] = [{ type: DRAFT }, { press: "Ctrl+s" }, { wait: "stashed (ctrl+s restores)" }];

export default site({
  plugin: "claude-compat",
  demo: {
    caption:
      "ctrl+s puts the draft aside and clears the editor; sending the next prompt brings the draft back, and it survives a restart.",
    harness: "pi",
    project: "sync-worker",
    setup,
    start,
    steps: [
      { sleep: 600 },
      slow(DRAFT),
      { sleep: 1200 },
      { press: "Ctrl+s" },
      { wait: "stashed (ctrl+s restores)" },
      { sleep: 2200 },
      poster,
      slow(QUICK),
      { press: "Enter" },
      { wait: "reports the upload as failed", timeout: 20_000 },
      { sleep: 3500 },
    ],
  },
  stills: {
    stashed: {
      caption:
        "A draft put aside with ctrl+s waits in a line under the editor; ctrl+s on an empty editor brings it back.",
      harness: "pi",
      project: "sync-worker",
      setup,
      start,
      steps: [
        { type: QUICK },
        { press: "Enter" },
        { wait: "reports the upload as failed", timeout: 20_000 },
        ...STASH,
      ],
    },
  },
});
