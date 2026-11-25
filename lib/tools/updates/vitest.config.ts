import { defineConfig } from "vitest/config";

// The bridge's specs: one extension handed a scripted pi API and a temporary state directory,
// with no session, no package built and no agent logged in.
export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  test: {
    root: new URL(".", import.meta.url).pathname,
    include: ["src/**/*.spec.ts"],
    testTimeout: 30_000,
  },
});
