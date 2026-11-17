/**
 * Rewrites `COMPONENTS.md`: which component each harness has and which features each supports, from
 * the manifests in `components/`. The stories it names are played in a real agent by `npm run e2e
 * kit`, and drawn on demand by `/kit` (kit/README.md).
 *
 *   npm run components            fail on a manifest problem, then write COMPONENTS.md
 *   npm run components -- --check fail on a problem or a stale COMPONENTS.md, write nothing
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { here, loadModel, markdown } from "./model.ts";

const file = join(here, "COMPONENTS.md");
const model = await loadModel();
if (model.problems.length > 0) {
  console.error(
    `components: ${model.problems.length} problem(s):\n- ${model.problems.join("\n- ")}`,
  );
  process.exit(1);
}
if (model.notMirrored.length > 0)
  console.log(`components: not yet mirrored:\n- ${model.notMirrored.join("\n- ")}`);

const wanted = markdown(model);
if (process.argv.includes("--check")) {
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (current !== wanted) {
    console.error(`components: ${relative(here, file)} is out of date; run \`npm run components\``);
    process.exit(1);
  }
  console.log("components: ok");
} else {
  writeFileSync(file, wanted);
  console.log(`components: ${relative(here, file)} written`);
}
