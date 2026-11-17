import { defineConfig } from "vitest/config";

// The cores and the pi kit only: a plugin's `*.test.tsx` are Claude Code's own (`claude plugin test`),
// which never runs a `*.spec.ts`. A string `tsconfigRaw` skips the nearest tsconfig.json, whose
// types only `just dev-setup` lays.
export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  test: { include: ["plugins/*/core/**/*.spec.ts", "kit/**/*.spec.ts", "scripts/**/*.spec.ts"] },
});
