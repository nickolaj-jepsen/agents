/**
 * Builds the catalogue's data from the component manifests and each kit's source:
 * `COMPONENTS.md` (what agents read, committed), `site/data/kit.json` (what the site reads) and the
 * stories' crops. The last two are not committed: the Pages workflow writes them (`just media`).
 *
 *   npm run catalog                play the kit scenarios in PNG mode, then write all three; fail
 *                                  on a manifest problem or a scenario that no longer matches
 *   npm run catalog -- --no-shots  write all three from the PNGs already there, if any
 *   npm run catalog -- --check     no PNGs needed: fail on a problem or a stale COMPONENTS.md
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cropShots } from "./crops.ts";
import { here, loadModel, markdown, siteData } from "./model.ts";

const outputs = {
  components: join(here, "COMPONENTS.md"),
  // In the site's own folder, beside the content model: its pages read no data from outside it.
  catalog: join(here, "..", "..", "site/data/kit.json"),
};
const check = process.argv.includes("--check");

if (!check && !process.argv.includes("--no-shots")) {
  // The PNGs are not committed: this is where the e2e run draws them.
  const done = spawnSync(process.execPath, ["e2e/run.ts", "kit"], {
    cwd: join(here, "..", ".."),
    stdio: "inherit",
    env: { ...process.env, E2E_PNG: "1" },
  });
  if (done.status !== 0) {
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
if (check) {
  let stale = false;
  for (const k of ["components"] as const) {
    const current = existsSync(outputs[k]) ? readFileSync(outputs[k], "utf8") : "";
    if (current !== wanted[k]) {
      console.error(`catalog: ${outputs[k]} is out of date; run \`npm run catalog -- --no-shots\``);
      stale = true;
    }
  }
  if (stale) process.exit(1);
  console.log("catalog: ok");
  process.exit(0);
}
for (const k of ["components", "catalog"] as const) {
  mkdirSync(dirname(outputs[k]), { recursive: true });
  writeFileSync(outputs[k], wanted[k]);
}
const crops = cropShots();
console.log(
  `catalog: ${crops.written} crop(s) written, ${crops.kept} unchanged, ${crops.removed} removed; COMPONENTS.md and site/data/kit.json written`,
);
