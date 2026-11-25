import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  test: { include: ["src/pi/**/*.spec.ts"] },
});
