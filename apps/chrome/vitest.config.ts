import { defineConfig } from "vitest/config";

// The lib's specs only. A string `tsconfigRaw` keeps esbuild off the nearest tsconfig.json; tsc owns
// those.
export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  test: { include: ["src/lib/**/*.spec.ts"] },
});
