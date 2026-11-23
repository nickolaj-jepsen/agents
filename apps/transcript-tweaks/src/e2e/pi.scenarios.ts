import type { Turn } from "@agents/drive/lib/harness.ts";
import { gridLines, type Region } from "@agents/drive/lib/screen.ts";
import { scenarios } from "@agents/drive/lib/scenario.ts";

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

const setup: (ctx: { write(rel: string, content: string): void; initRepo(): void }) => void = (
  ctx,
) => {
  ctx.write("src/sync.ts", SYNC);
  ctx.write("test.sh", TEST);
  ctx.initRepo();
};

const ASK = "How does the sync worker retry a failed upload?";

const turns: Turn[] = [
  {
    text: "The retry is `backoff()` plus the loop in `upload()`.",
    toolCall: { name: "read", arguments: { path: "src/sync.ts" } },
  },
  {
    text: "Running the tests to confirm they pass as they are.",
    toolCall: { name: "bash", arguments: { command: "sh test.sh" } },
  },
  {
    text: "Retries double the delay from one second, cap it at a minute, and give up after five tries.",
  },
];

/**
 * The transcript from the first reply that carries the gutter to the last line of the answer,
 * so the footer and the composer's own rule stay out of the plugin's screen.
 */
const transcript: Region = (grid) => {
  const lines = gridLines(grid);
  const top = lines.findIndex((line) => line.includes("▌"));
  if (top < 0) return undefined;
  const rule = lines.findIndex((line, at) => at > top && /^─{20,}$/.test(line));
  const bottom = rule < 0 ? lines.length - 1 : rule - 1;
  return { x: 0, y: top, w: grid[0]?.length ?? 0, h: Math.max(1, bottom - top + 1) };
};

const asked = [
  { type: ASK },
  { press: "Enter" },
  { wait: "Retries double the delay", timeout: 30_000 },
];

export default scenarios({
  plugin: "transcript-tweaks",
  harness: "pi",
  // Hermetic: its own config with this plugin alone, so nothing of the person's setup shows.
  start: { hermetic: true, plugins: ["transcript-tweaks"], turns },
  region: transcript,
  scenarios: {
    folded: {
      about:
        "a reply with the gutter, then a finished read and command as one line each: duration, size and the line the command ended on",
      setup,
      // The footer's branch and the composer's height wrap at 70 columns; the transcript does not.
      sizes: [
        [112, 32],
        [160, 45],
      ],
      steps: asked,
    },
    expanded: {
      about: "ctrl+o opens pi's own result bodies again, gutter and tool calls untouched",
      from: "folded",
      // Taller than pi keeps in a normal window: the bodies it draws are both whole, not cut by the screen.
      sizes: [[240, 60]],
      steps: [{ press: "Ctrl+o" }, { wait: "MAX_TRIES" }],
    },
    failed: {
      about: "a failed read keeps pi's own error result, not a success line",
      start: {
        turns: [
          {
            text: "Reading the missing file.",
            toolCall: { name: "read", arguments: { path: "missing.ts" } },
          },
          { text: "It is not there." },
        ],
      },
      sizes: [
        [112, 32],
        [160, 45],
      ],
      steps: [
        { type: "Read the missing file." },
        { press: "Enter" },
        { wait: "It is not there.", timeout: 30_000 },
      ],
    },
    payload: {
      about: "an edit keeps pi's diff, which is the result rather than a report about it",
      setup,
      start: {
        turns: [
          {
            text: "Capping the retry.",
            toolCall: {
              name: "edit",
              arguments: {
                path: "src/sync.ts",
                edits: [
                  {
                    oldText: "Math.min(1000 * 2 ** n, 60_000)",
                    newText: "Math.min(1000 * 2 ** n, 30_000)",
                  },
                ],
              },
            },
          },
          { text: "Capped at thirty seconds." },
        ],
      },
      sizes: [
        [112, 32],
        [160, 45],
      ],
      steps: [
        { type: "Cap the retry at thirty seconds." },
        { press: "Enter" },
        { wait: "Capped at thirty seconds.", timeout: 30_000 },
      ],
    },
    long: {
      about:
        "a command whose last line is longer than the room: the one folded row is cut with … instead of wrapping",
      start: {
        turns: [
          {
            text: "Running the fixture.",
            toolCall: {
              name: "bash",
              arguments: {
                command: `printf 'long-output-%s' "$(printf 'marker%.0s' {1..10})"`,
              },
            },
          },
          { text: "Done." },
        ],
      },
      // The folded row itself, found by the marker only the command's output spells out in full.
      region: (grid) => {
        const lines = gridLines(grid);
        const y = lines.findIndex((line) => line.includes("long-output-marker"));
        return y < 0 ? undefined : { x: 0, y, w: grid[0]?.length ?? 0, h: 1 };
      },
      sizes: [[70, 24]],
      steps: [{ type: "Run the fixture." }, { press: "Enter" }, { wait: "Done.", timeout: 30_000 }],
    },
  },
});
