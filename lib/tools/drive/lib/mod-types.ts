/**
 * `drive types <package>`: load a copy of the build in hermetic Claude, then publish the
 * engine's declarations for tsc. A live Claude can rewrite its own types in dist at any time.
 */
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { checkoutMods } from "./harness.ts";
import { distOf, e2ePackage } from "./packages.ts";
import { Session } from "./session.ts";

const typesPath = [".claude-plugin", "types"] as const;
const declarations = [
  "tsconfig.json",
  "claude-code/index.d.ts",
  "claude-code-tools/index.d.ts",
  "claude-code-mcp/index.d.ts",
];

/** The engine creates the directory before it writes its contents. Wait for every file to settle. */
async function waitForTypes(types: string, timeoutSeconds: number) {
  const until = Date.now() + timeoutSeconds * 1000;
  let previous: string | undefined;
  do {
    const stats = declarations.map((file) =>
      statSync(join(types, file), { throwIfNoEntry: false }),
    );
    const stamp = stats.every((s) => s && s.size > 0)
      ? stats.map((s) => `${s?.size}:${s?.mtimeMs}`).join(";")
      : undefined;
    if (stamp && stamp === previous) return;
    previous = stamp;
    await sleep(250);
  } while (Date.now() <= until);
  throw new Error(`Claude did not finish writing ${types} in ${timeoutSeconds}s`);
}

export async function loadTypes(app: string, timeoutSeconds = 90): Promise<string> {
  if (!e2ePackage(app)) throw new Error(`no package ${app}; \`ls\` lists them`);
  checkoutMods([app]);
  const dist = distOf(app);
  const pkg = dirname(dist);
  const cached = join(pkg, ".claude-types");
  // Keep staging on the same filesystem as the snapshot, but out of source and bundle inputs.
  const scratchRoot = join(pkg, "node_modules", ".cache");
  mkdirSync(scratchRoot, { recursive: true });
  const scratch = mkdtempSync(join(scratchRoot, "drive-types-"));
  try {
    const mod = join(scratch, "mod");
    const liveTypes = join(dist, ...typesPath);
    cpSync(dist, mod, {
      recursive: true,
      filter: (path) => path !== liveTypes && path !== join(dist, "tsconfig.json"),
    });
    const types = join(mod, ...typesPath);
    const session = await Session.open({
      harness: "claude",
      start: { hermetic: true, plugins: [], args: ["--plugin-dir", mod], turns: [] },
      size: [120, 34],
      backend: "daemon",
      name: `types-${app}-${process.pid}`,
    });
    try {
      await waitForTypes(types, timeoutSeconds);
    } finally {
      await session.close();
    }
    rmSync(cached, { recursive: true, force: true });
    renameSync(types, cached);
    return cached;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
