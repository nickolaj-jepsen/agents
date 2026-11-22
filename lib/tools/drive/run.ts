/**
 * `node run.ts [package] [-u] [vitest args]`: the e2e tests, all or one package's (an app, or `kit-<name>`).
 * Run from a package's folder (its `e2e` task), the package is that folder's unless one is named.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { e2ePackage, e2ePackageAt } from "./lib/packages.ts";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const env: NodeJS.ProcessEnv = { ...process.env };
const named = args[0] && !args[0].startsWith("-") ? args.shift() : undefined;
const plugin = named ?? e2ePackageAt(process.cwd())?.name;
if (plugin) {
  if (!e2ePackage(plugin)) {
    console.error(`no package ${plugin} with an e2e folder`);
    process.exit(2);
  }
  env.E2E_PLUGIN = plugin;
}
// The scenarios run before the tests, so the runner needs to know which tests were asked for.
for (const flag of ["-t", "--testNamePattern"]) {
  const at = args.indexOf(flag);
  if (at >= 0 && args[at + 1]) env.E2E_FILTER = args[at + 1];
}
// vitest's exports do not name its bin, so it is found beside its package.json.
const vitest = join(
  dirname(createRequire(import.meta.url).resolve("vitest/package.json")),
  "vitest.mjs",
);
const done = spawnSync(
  process.execPath,
  [vitest, "run", "-c", `${here}/vitest.config.ts`, ...args],
  {
    stdio: "inherit",
    env,
  },
);
process.exit(done.status ?? 1);
