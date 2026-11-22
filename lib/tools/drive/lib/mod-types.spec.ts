import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it, vi } from "vitest";
import { loadTypes } from "./mod-types.ts";

const mocks = vi.hoisted(() => ({ dist: "", open: vi.fn() }));
vi.mock("./packages.ts", () => ({ distOf: () => mocks.dist, e2ePackage: () => ({}) }));
vi.mock("./harness.ts", () => ({ checkoutMods: () => [] }));
vi.mock("./session.ts", () => ({ Session: { open: mocks.open } }));

it("keeps Claude open until it has written the declarations, not just their directory", async () => {
  mocks.dist = mkdtempSync(join(tmpdir(), "drive-mod-types-"));
  const types = join(mocks.dist, ".claude-plugin", "types");
  const files = [
    "tsconfig.json",
    "claude-code/index.d.ts",
    "claude-code-mcp/index.d.ts",
    "claude-code-tools/index.d.ts",
  ];
  let writer: ReturnType<typeof setTimeout> | undefined;
  mocks.open.mockImplementation(async () => {
    mkdirSync(types, { recursive: true });
    writer = setTimeout(() => {
      for (const name of files) {
        const file = join(types, name);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, "generated");
      }
    }, 25);
    return { close: () => clearTimeout(writer) };
  });
  try {
    expect(await loadTypes("fixture", 1)).toBe(types);
    expect(files.every((name) => existsSync(join(types, name)))).toBe(true);
  } finally {
    clearTimeout(writer);
    rmSync(mocks.dist, { recursive: true, force: true });
  }
});
