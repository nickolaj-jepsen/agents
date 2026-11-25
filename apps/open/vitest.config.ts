import { defineConfig } from "vitest/config";

// The lib's specs only: `src/claude.test.tsx` is Claude Code's own (`claude plugin test`), which never runs a
// `*.spec.ts`. A string `tsconfigRaw` keeps esbuild off the nearest tsconfig.json; tsc owns those.
export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  // Turbo runs every package's specs and type-checks at once: on a small runner a 1–4 s spec can pass 5 s.
  test: { include: ["src/lib/**/*.spec.ts"], testTimeout: 20_000 },
});
