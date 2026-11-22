/**
 * `node e2e/run.ts [plugin] [-u] [vitest args]`: the e2e tests, all or one plugin's. Run from an
 * `e2e/<plugin>/` package (its `e2e` task), the plugin is that folder's unless one is named.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const env: NodeJS.ProcessEnv = { ...process.env };
const named = args[0] && !args[0].startsWith("-") ? args.shift() : undefined;
const plugin = named ?? (dirname(process.cwd()) === here ? basename(process.cwd()) : undefined);
if (plugin) {
  if (!existsSync(`${here}/${plugin}`)) {
    console.error(`no e2e/${plugin}/`);
    process.exit(2);
  }
  env.E2E_PLUGIN = plugin;
}
// The scenarios run before the tests, so the runner needs to know which tests were asked for.
for (const flag of ["-t", "--testNamePattern"]) {
  const at = args.indexOf(flag);
  if (at >= 0 && args[at + 1]) env.E2E_FILTER = args[at + 1];
}
const vitest = createRequire(import.meta.url).resolve("vitest/vitest.mjs");
const done = spawnSync(
  process.execPath,
  [vitest, "run", "-c", `${here}/vitest.config.ts`, ...args],
  {
    stdio: "inherit",
    env,
  },
);
process.exit(done.status ?? 1);
