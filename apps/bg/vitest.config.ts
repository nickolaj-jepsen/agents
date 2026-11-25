import { defineConfig } from "vitest/config";

// The lib's specs only. A string `tsconfigRaw` keeps esbuild off the nearest tsconfig.json; tsc owns
// those.
export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  // The specs that drive a real session spawn real shells: on a small runner a 1-4 s spec can pass 5 s.
  test: { include: ["src/lib/**/*.spec.ts"], testTimeout: 20_000 },
});
