/**
 * Builds the catalogue's files from the component manifests and each kit's source: `COMPONENTS.md`
 * and the kit index in `AGENTS.md` (what agents read, committed). The site reads the model itself,
 * with a loader of its own (`apps/site/src/loaders/kit.ts`), joined with the stories' crops that
 * each kit package's `media` task writes.
 *
 *   turbo run //#catalog:docs          write the two files; fail on a manifest problem
 *   node src/build.ts --check          fail on a problem or a stale COMPONENTS.md or AGENTS.md index
 *                                      (the block between its `kit:index` markers)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { here, loadModel, markdown, repoRoot, withIndex } from "./model.ts";

const agents = join(repoRoot, "AGENTS.md");
const components = join(here, "..", "COMPONENTS.md");
const check = process.argv.includes("--check");
const model = await loadModel();
if (model.problems.length > 0) {
  console.error(`catalog: ${model.problems.length} problem(s):\n- ${model.problems.join("\n- ")}`);
  process.exit(1);
}
if (model.notMirrored.length > 0)
  console.log(`catalog: not yet mirrored:\n- ${model.notMirrored.join("\n- ")}`);

const componentsWanted = markdown(model);
const agentsNow = readFileSync(agents, "utf8");
const agentsWanted = withIndex(agentsNow, model);
if (agentsWanted === undefined) {
  console.error("catalog: AGENTS.md has no `kit:index` start and end markers");
  process.exit(1);
}
if (check) {
  let stale = false;
  if (agentsNow !== agentsWanted) {
    console.error(`catalog: ${agents} has a stale kit index; run \`pnpm turbo run build\``);
    stale = true;
  }
  const current = existsSync(components) ? readFileSync(components, "utf8") : "";
  if (current !== componentsWanted) {
    console.error(`catalog: ${components} is out of date; run \`pnpm turbo run build\``);
    stale = true;
  }
  if (stale) process.exit(1);
  console.log("catalog: ok");
  process.exit(0);
}
writeFileSync(agents, agentsWanted);
writeFileSync(components, componentsWanted);
console.log("catalog: COMPONENTS.md and the AGENTS.md index written");
