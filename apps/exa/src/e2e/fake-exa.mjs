// Preloaded into pi (`NODE_OPTIONS=--import=...`) so the exa plugin's fetch to api.exa.ai is
// answered here and never leaves the machine. Any other request goes through untouched.
const real = globalThis.fetch;

const SEARCH = {
  results: [
    {
      title: "Test sharding | Vitest",
      url: "https://vitest.dev/guide/improving-performance#sharding",
      publishedDate: "2025-06-02T00:00:00.000Z",
      highlights: [
        "Run `vitest run --shard=1/3` on one machine and `--shard=2/3` on the next: each takes a third of the test files. Add `--reporter=blob` to each run, then `vitest --merge-reports` to join the results.",
      ],
    },
    {
      title: "Command Line Interface | Vitest",
      url: "https://vitest.dev/guide/cli",
      publishedDate: "2025-05-14T00:00:00.000Z",
      highlights: [
        "--shard <shards>: test suite shard to execute in a format of <index>/<count>, where index is the position of the shard and count the number of shards the files are split into.",
      ],
    },
    {
      title: "Sharding a Vitest suite across CI jobs",
      url: "https://example.org/blog/vitest-ci-matrix",
      publishedDate: "2025-03-21T00:00:00.000Z",
      highlights: [
        "A matrix of `shard: [1, 2, 3]` and a step running `npx vitest run --shard=${{ matrix.shard }}/3` cut the suite from nine minutes to three.",
      ],
    },
  ],
  costDollars: { total: 0.007 },
};

const fake = async (input, init) => {
  const url = String(input?.url ?? input);
  if (!url.startsWith("https://api.exa.ai/")) return real(input, init);
  const body = url.endsWith("/search") ? SEARCH : { results: [] };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

// pi installs its own fetch at startup (configureHttpDispatcher), after this preload; ignore that.
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  get: () => fake,
  set: () => {},
});
