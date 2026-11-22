import { defineConfig } from "vitest/config";

// `-u` accepts snapshots the way vitest's own do: the workers read E2E_UPDATE.
if (process.argv.includes("-u") || process.argv.includes("--update")) process.env.E2E_UPDATE = "1";

// Run by `node run.ts`, the `e2e` task of each app and kit package; not by the generic `test`.
export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  test: {
    root: new URL(".", import.meta.url).pathname,
    include: ["e2e.spec.ts"],
    testTimeout: 240_000,
    hookTimeout: 3_600_000,
  },
});
