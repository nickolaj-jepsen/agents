import { defineConfig } from "vitest/config";

// `claude/ui.tsx` is a Claude Code mod's file: its elements are made with the engine's `h` and
// `Fragment`, so the spec compiles it the way the build does.
export default defineConfig({
  oxc: { jsx: { runtime: "classic", pragma: "h", pragmaFrag: "Fragment" } },
  // Turbo runs every package's specs and type-checks at once: on a small runner a 1–4 s spec can pass 5 s.
  test: { include: ["src/**/*.spec.ts"], testTimeout: 20_000 },
});
