import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { loadTypes } from "./mod-types.ts";
import type { OpenOptions } from "./session.ts";

const { open } = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("./session.ts", () => ({ Session: { open } }));
vi.mock("./packages.ts", () => ({ distOf: () => dist, e2ePackage: () => ({}) }));
vi.mock("./harness.ts", () => ({ checkoutMods: () => [dist] }));

let folder: string;
let dist: string;
let live: string;
let cached: string;
const typesOf = (mod: string) => join(mod, ".claude-plugin", "types");

function put(file: string, text: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "mod-types-"));
  dist = join(folder, "dist");
  live = typesOf(dist);
  cached = join(folder, ".claude-types");
  put(join(dist, ".claude-plugin", "plugin.json"), '{"name":"fixture"}');
  put(join(live, "tsconfig.json"), "live session owned");
  put(join(cached, "tsconfig.json"), "last good snapshot");
  open.mockReset();
});
afterEach(() => rmSync(folder, { recursive: true, force: true }));

test("publishes complete declarations from a copy without touching a live mod", async () => {
  const close = vi.fn();
  open.mockImplementation(async ({ start }: OpenOptions) => {
    const mod = start?.args?.[1] ?? "";
    expect(start?.plugins).toEqual([]);
    expect(mod).not.toBe(dist);
    expect(existsSync(join(mod, ".claude-plugin", "plugin.json"))).toBe(true);
    const types = typesOf(mod);
    expect(existsSync(types)).toBe(false);
    mkdirSync(types);
    setTimeout(() => {
      put(join(types, "tsconfig.json"), "{}");
      put(join(types, "claude-code/index.d.ts"), "export {};");
      put(join(types, "claude-code-tools/index.d.ts"), "export {};");
      put(join(types, "claude-code-mcp/index.d.ts"), "export {};");
    }, 10);
    return { close };
  });
  expect(await loadTypes("fixture", 3)).toBe(cached);
  expect(close).toHaveBeenCalledOnce();
  expect(readFileSync(join(live, "tsconfig.json"), "utf8")).toBe("live session owned");
  expect(readFileSync(join(cached, "tsconfig.json"), "utf8")).toBe("{}");
  expect(existsSync(join(cached, "claude-code-tools/index.d.ts"))).toBe(true);
});

test("keeps the previous snapshot when generation never completes", async () => {
  const close = vi.fn();
  open.mockImplementation(async ({ start }: OpenOptions) => {
    put(join(typesOf(start?.args?.[1] ?? ""), "tsconfig.json"), "{}");
    return { close };
  });
  await expect(loadTypes("fixture", 0)).rejects.toThrow("did not finish writing");
  expect(close).toHaveBeenCalledOnce();
  expect(readFileSync(join(cached, "tsconfig.json"), "utf8")).toBe("last good snapshot");
});
