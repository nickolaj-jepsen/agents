import { defineConfig } from "vitest/config";

export default defineConfig({
  // Turbo runs every package's specs and type-checks at once: on a small runner a 1–4 s spec can pass 5 s.
  test: { include: ["src/**/*.spec.ts"], testTimeout: 20_000 },
});
