import { defineConfig } from "vitest/config";

// The lib's specs only: they drive the bridge's mocked `hc` and the monitor's
// own script, and touch the filesystem under a private temp folder.
export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  // Turbo runs every package's specs and type-checks at once: on a small runner a 1–4 s spec can pass 5 s.
  test: { include: ["src/lib/**/*.spec.ts"], testTimeout: 20_000 },
});
