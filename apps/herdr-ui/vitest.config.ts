import { defineConfig } from "vitest/config";

// The specs of the mods' own helpers, which live under `src/mods/` and are loaded by Herdr as they
// are. A string `tsconfigRaw` keeps esbuild off the nearest tsconfig.json; tsc owns that.
export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  // Turbo runs every package's specs and type-checks at once: on a small runner a 1–4 s spec can pass 5 s.
  test: { include: ["src/lib/**/*.spec.ts"], testTimeout: 20_000 },
});
