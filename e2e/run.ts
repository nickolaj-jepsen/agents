/** `npm run e2e [plugin] [-u] [vitest args]`: the e2e tests, all or one plugin's. */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const env = { ...process.env };
if (args[0] && !args[0].startsWith("-")) {
  const plugin = args.shift() as string;
  if (!existsSync(new URL(`./${plugin}`, import.meta.url))) {
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
const done = spawnSync("npx", ["vitest", "run", "-c", "e2e/vitest.config.ts", ...args], {
  stdio: "inherit",
  env,
});
process.exit(done.status ?? 1);
