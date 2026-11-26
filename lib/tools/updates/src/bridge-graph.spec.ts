/**
 * The pi package ships the bridge alone, not the CLI: its import graph must stay inside the shared
 * core, so a store copy needs no build, no nix and no npm dependency.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const BRIDGE = fileURLToPath(new URL("agents-update.ts", import.meta.url));
const CORE = fileURLToPath(new URL("core", import.meta.url));

const importsOf = (source: string): string[] => {
  const found: string[] = [];
  const pattern = /^\s*(?:import|export)\s+(?:type\s+)?[^"';]*?from\s+["']([^"']+)["']/gm;
  let match = pattern.exec(source);
  while (match !== null) {
    found.push(match[1]!);
    match = pattern.exec(source);
  }
  return found;
};

test("the bridge imports only the shared core and node", () => {
  const seen = new Set<string>();
  const queue = [BRIDGE];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = fs.readFileSync(file, "utf8");
    for (const specifier of importsOf(source)) {
      if (specifier.startsWith("node:")) continue;
      if (specifier === "@earendil-works/pi-coding-agent") continue;
      assert.ok(specifier.startsWith("./"), `${file} imports ${specifier}, which is not relative`);
      const resolved = fileURLToPath(new URL(specifier, `file://${file}`));
      assert.ok(
        resolved.startsWith(`${CORE}/`),
        `${file} imports ${specifier}: the pi package carries the bridge and the core only`,
      );
      queue.push(resolved);
    }
  }
  assert.ok(seen.size > 1, "the bridge imports the core it was checked against");
  assert.ok(
    [...seen].some((file) => file.startsWith(`${CORE}/`)),
    "the bridge imports the shared core",
  );
});
