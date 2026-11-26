import { resolveScenario } from "@agents/drive/lib/scenario.ts";
import { site } from "@agents/drive/lib/site.ts";
import scenarios from "./pi.scenarios.ts";

const expanded = resolveScenario(scenarios, "expanded");

export default site({
  plugin: "claude-peers",
  stills: {
    message: {
      caption:
        "A message from another session, expanded with Ctrl+O to show its text and reply address.",
      harness: "pi",
      project: "sync-worker",
      // Keep startup warnings above the visible transcript, not in the product picture.
      size: [120, 24],
      start: expanded.start,
      setup: async (ctx) => {
        for (const setup of expanded.setup) await setup(ctx);
      },
      steps: expanded.steps,
    },
  },
});
