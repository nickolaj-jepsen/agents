import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  test: { include: ["src/**/*.spec.ts"], testTimeout: 20_000 },
});
