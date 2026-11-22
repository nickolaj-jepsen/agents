import { defineConfig } from "vitest/config";

// Run by `drive test <package>`, the `e2e` task of each app and kit package; not by the generic
// `test`. Its flags reach the workers through `lib/options.ts`.
export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  test: {
    root: new URL(".", import.meta.url).pathname,
    include: ["e2e.spec.ts"],
    testTimeout: 240_000,
    hookTimeout: 3_600_000,
  },
});
