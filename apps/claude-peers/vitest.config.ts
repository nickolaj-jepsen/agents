import { defineConfig } from "vitest/config";

// The peers' specs: the wire protocol, the registry's writes and the metadata contract. The e2e
// scenario is the driver's, not vitest's. A string `tsconfigRaw` keeps esbuild off tsconfig.json.
export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  // Turbo runs every package's specs and type-checks at once: on a small runner a 1–4 s spec can pass 5 s.
  test: { include: ["src/pi/**/*.spec.ts"], testTimeout: 20_000 },
});
