import { fileURLToPath } from "node:url";
import type { Turn } from "../lib/harness.ts";
import { site } from "../lib/site.ts";

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url));

const turns: Turn[] = [
  {
    text: "That is outside the repo, so I'll search the web.",
    toolCall: {
      name: "exa_search",
      arguments: {
        query: "how to split a vitest run across several CI machines",
        objective:
          "Official Vitest docs first. The flag that shards the test files, and how the results are merged.",
        numResults: 3,
      },
    },
  },
  {
    text: "Vitest splits a run with `--shard=<index>/<count>`; write each shard's results as a blob and join them with `--merge-reports`.",
  },
];

export default site({
  plugin: "exa",
  stills: {
    search: {
      caption:
        "exa_search hands the model titled, dated results with their URLs and the passages that answer the query, sized to its context window.",
      harness: "pi",
      project: "web-app",
      start: {
        hermetic: true,
        plugins: ["exa"],
        turns,
        env: {
          PI_EXA_KEY_FILE: here("key.txt"),
          NODE_OPTIONS: `--import=${here("fake-exa.mjs")}`,
        },
      },
      steps: [
        { type: "How do I shard vitest in CI?" },
        { press: "Enter" },
        { wait: "join them with", timeout: 30_000 },
        { press: "Ctrl+o" },
        { wait: "Test sharding" },
      ],
    },
  },
});
