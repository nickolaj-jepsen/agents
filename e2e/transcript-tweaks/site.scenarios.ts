import type { Turn } from "../lib/harness.ts";
import type { Step } from "../lib/scenario.ts";
import { poster, site, slow, type SiteScenario } from "../lib/site.ts";

const SYNC = `const MAX_TRIES = 5;

/** Delay before try \`n\`, doubled each time and capped at a minute. */
export function backoff(n: number): number {
  return Math.min(1000 * 2 ** n, 60_000);
}

export async function upload(send: () => Promise<Response>): Promise<Response> {
  for (let n = 0; n < MAX_TRIES; n++) {
    const res = await send();
    if (res.status !== 429) return res;
    await new Promise((done) => setTimeout(done, backoff(n)));
  }
  throw new Error("upload failed after 5 tries");
}
`;

const TEST = `#!/bin/sh
echo "sync.test.ts"
echo "  ok  backoff doubles the delay"
echo "  ok  backoff stops at a minute"
echo "  ok  upload returns the first non-429 response"
echo "  ok  upload gives up after five tries"
echo
echo "4 passed, 0 failed"
`;

const setup: SiteScenario["setup"] = (ctx) => {
  ctx.write("src/sync.ts", SYNC);
  ctx.write("test.sh", TEST);
  ctx.initRepo();
};

const turns: Turn[] = [
  {
    text: "I'll start with the worker itself.",
    toolCall: { name: "read", arguments: { path: "src/sync.ts" } },
  },
  {
    text: "The retry is `backoff()` plus the loop in `upload()`. Let me see where else it is used.",
    toolCall: { name: "bash", arguments: { command: "grep -rn backoff src" } },
  },
  {
    text: "Only `upload()` uses it. Running the tests to confirm they pass as they are.",
    toolCall: { name: "bash", arguments: { command: "sh test.sh" } },
  },
  {
    text: "Retries double the delay from one second, cap it at a minute, and give up after five tries. All four tests pass.",
  },
];

const ask = "How does the sync worker retry a failed upload?";
const start = { hermetic: true, plugins: ["transcript-tweaks"], turns };
const ASKED: Step[] = [
  { type: ask },
  { press: "Enter" },
  { wait: "All four tests pass", timeout: 30_000 },
];

export default site({
  plugin: "transcript-tweaks",
  demo: {
    caption:
      "Each reply gets a rule in front, and a finished tool call is one line. ctrl+o opens the full results again.",
    harness: "pi",
    project: "sync-worker",
    setup,
    start,
    steps: [
      { sleep: 600 },
      slow(ask, 30),
      { sleep: 400 },
      { press: "Enter" },
      { wait: "All four tests pass", timeout: 30_000 },
      { sleep: 3500 },
      poster,
      { press: "Ctrl+o" },
      { sleep: 3500 },
      { press: "Ctrl+o" },
      { sleep: 2500 },
    ],
  },
  stills: {
    collapsed: {
      caption:
        "A collapsed tool result is its status, duration and size, and for a command the line it ended on.",
      harness: "pi",
      project: "sync-worker",
      setup,
      start,
      steps: ASKED,
    },
  },
});
