/**
 * `drive types <package>`: the engine lays the Claude Code API types a mod is written against into the
 * mod's `dist/.claude-plugin/types/` when it loads it. This starts a hermetic Claude with the app's
 * build, waits until they are there and stops.
 */
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { checkoutMods } from "./harness.ts";
import { distOf, e2ePackage } from "./packages.ts";
import { Session } from "./session.ts";

export async function loadTypes(app: string, timeoutSeconds = 90): Promise<string> {
  if (!e2ePackage(app)) throw new Error(`no package ${app}; \`ls\` lists them`);
  checkoutMods([app]);
  const types = join(distOf(app), ".claude-plugin", "types");
  // Gone first, so what is there afterwards is what this engine wrote.
  rmSync(types, { recursive: true, force: true });
  const session = await Session.open({
    harness: "claude",
    start: { hermetic: true, plugins: [app], turns: [] },
    size: [120, 34],
    backend: "daemon",
    name: `types-${app}-${process.pid}`,
  });
  try {
    const until = Date.now() + timeoutSeconds * 1000;
    while (!existsSync(types)) {
      if (Date.now() > until)
        throw new Error(`Claude did not write ${types} in ${timeoutSeconds}s`);
      await sleep(250);
    }
  } finally {
    await session.close();
  }
  return types;
}
