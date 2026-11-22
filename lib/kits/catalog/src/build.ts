/**
 * Builds the catalogue's data from the component manifests and each kit's source:
 * `COMPONENTS.md` (what agents read, committed), `apps/site/data/kit.json` (what the site reads) and the
 * stories' crops. The last two are not committed: the Pages workflow writes them (`turbo run media`).
 *
 *   turbo run catalog                  play the kit scenarios in PNG mode, then write all three; fail
 *                                      on a manifest problem or a scenario that no longer matches
 *   turbo run catalog -- --no-shots    write all three from the PNGs already there, if any
 *   turbo run catalog -- --check       no PNGs needed: fail on a problem or a stale COMPONENTS.md or
 *                                      AGENTS.md index (the block between its `kit:index` markers)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cropShots } from "./crops.ts";
import { here, loadModel, markdown, repoRoot, siteData, withIndex } from "./model.ts";

const agents = join(repoRoot, "AGENTS.md");
const outputs = {
  components: join(here, "..", "COMPONENTS.md"),
  // In the site's own folder, beside the content model: its pages read no data from outside it.
  catalog: join(repoRoot, "apps/site/data/kit.json"),
};
const check = process.argv.includes("--check");

if (!check && !process.argv.includes("--no-shots")) {
  // The PNGs are not committed: this is where the e2e run draws them.
  // The scenarios load the catalogue's build, and every kit package has some of them.
  const run = (script: string, ...args: string[]) =>
    spawnSync(process.execPath, [join(repoRoot, script), ...args], {
      cwd: repoRoot,
      stdio: "inherit",
      env: { ...process.env, E2E_PNG: "1" },
    });
  const packages = readdirSync(join(repoRoot, "lib/kits"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(repoRoot, "lib/kits", d.name, "e2e")))
    .map((d) => `kit-${d.name}`);
  const built = run("lib/tools/build/build.ts", "lib/kits/catalog");
  const done =
    built.status === 0
      ? packages.map((p) => run("lib/tools/drive/run.ts", p)).find((r) => r.status !== 0)
      : built;
  if (done && done.status !== 0) {
    console.error(
      "catalog: the kit scenarios failed; fix them, or use --no-shots for the PNGs there are",
    );
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

const wanted = { components: markdown(model), catalog: siteData(model) };
const agentsNow = readFileSync(agents, "utf8");
const agentsWanted = withIndex(agentsNow, model);
if (agentsWanted === undefined) {
  console.error("catalog: AGENTS.md has no `kit:index` start and end markers");
  process.exit(1);
}
if (check) {
  let stale = false;
  if (agentsNow !== agentsWanted) {
    console.error(
      `catalog: ${agents} has a stale kit index; run \`turbo run catalog -- --no-shots\``,
    );
    stale = true;
  }
  for (const k of ["components"] as const) {
    const current = existsSync(outputs[k]) ? readFileSync(outputs[k], "utf8") : "";
    if (current !== wanted[k]) {
      console.error(
        `catalog: ${outputs[k]} is out of date; run \`turbo run catalog -- --no-shots\``,
      );
      stale = true;
    }
  }
  if (stale) process.exit(1);
  console.log("catalog: ok");
  process.exit(0);
}
writeFileSync(agents, agentsWanted);
for (const k of ["components", "catalog"] as const) {
  mkdirSync(dirname(outputs[k]), { recursive: true });
  writeFileSync(outputs[k], wanted[k]);
}
const crops = cropShots();
console.log(
  `catalog: ${crops.written} crop(s) written, ${crops.kept} unchanged, ${crops.removed} removed; COMPONENTS.md, apps/site/data/kit.json and the AGENTS.md index written`,
);
