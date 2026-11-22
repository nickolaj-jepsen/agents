/**
 * Builds the catalogue's files from the component manifests and each kit's source: `COMPONENTS.md`
 * and the kit index in `AGENTS.md` (what agents read, committed), and the stories' crops under
 * `apps/site/media/kit/` (not committed). The site reads the model itself, with a loader of its own
 * (`apps/site/src/loaders/kit.ts`), joined with those crops.
 *
 *   turbo run catalog                  play the kit scenarios in PNG mode, crop them, and write the two
 *                                      files; fail on a manifest problem or a scenario that no longer
 *                                      matches
 *   turbo run catalog -- --no-shots    write the two files only (`turbo run build` runs this)
 *   turbo run catalog -- --check       fail on a problem or a stale COMPONENTS.md or AGENTS.md index
 *                                      (the block between its `kit:index` markers)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cropShots } from "./crops.ts";
import { here, loadModel, markdown, repoRoot, withIndex } from "./model.ts";

const agents = join(repoRoot, "AGENTS.md");
const components = join(here, "..", "COMPONENTS.md");
const check = process.argv.includes("--check");
const shots = !check && !process.argv.includes("--no-shots");

if (shots) {
  // The PNGs are not committed: this is where the e2e run draws them.
  // The scenarios load the catalogue's build, and every kit package has some of them.
  const run = (script: string, ...args: string[]) =>
    spawnSync(process.execPath, [join(repoRoot, script), ...args], {
      cwd: repoRoot,
      stdio: "inherit",
    });
  const packages = readdirSync(join(repoRoot, "lib/kits"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(repoRoot, "lib/kits", d.name, "e2e")))
    .map((d) => `kit-${d.name}`);
  const built = run("lib/tools/build/build.ts", "lib/kits/catalog");
  const done =
    built.status === 0
      ? packages
          .map((p) => run("lib/tools/drive/drive.ts", "test", p, "--png"))
          .find((r) => r.status !== 0)
      : built;
  if (done && done.status !== 0) {
    console.error("catalog: the kit scenarios failed; fix them, or use --no-shots to skip them");
    process.exit(1);
  }
}

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
const written = "COMPONENTS.md and the AGENTS.md index written";
if (shots) {
  const crops = cropShots();
  console.log(
    `catalog: ${crops.written} crop(s) written, ${crops.kept} unchanged, ${crops.removed} removed; ${written}`,
  );
} else console.log(`catalog: ${written}`);
