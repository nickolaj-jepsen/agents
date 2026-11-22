import { defineConfig } from "vitest/config";

// The driver's own specs: a module against scripted dependencies and real temporary folders, with
// no package built and no agent logged in. The screen tests are `e2e.spec.ts`, which `drive test
// <package>` runs through `vitest.config.ts`.
export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  test: {
    root: new URL(".", import.meta.url).pathname,
    include: ["lib/**/*.spec.ts"],
    testTimeout: 60_000,
  },
});
