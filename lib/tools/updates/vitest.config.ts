import { defineConfig } from "vitest/config";

// The CLI, the refresh helper and the bridge: real temporary directories and processes, a fake nix,
// and the flock(2) helper compiled once from pkgs/agents-flock.c. No store, network or agent.
export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  test: {
    root: new URL(".", import.meta.url).pathname,
    include: ["src/**/*.spec.ts"],
    testTimeout: 30_000,
  },
});
