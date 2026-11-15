/**
 * Builds the catalogue: `kit/catalog/index.html` (git-ignored) and `COMPONENTS.md`
 * (committed, generated) from the component manifests in `components/`, each kit's source
 * (props tables) and the kit scenarios' PNGs (`e2e/kit/__snapshots__/`, git-ignored). The
 * page is one file; `page.js` builds its DOM from the embedded model.
 *
 *   npm run catalog              play the kit scenarios in PNG mode, then write both files; fail
 *                                on a manifest problem or a scenario that no longer matches
 *   npm run catalog -- --no-shots  write both files from the PNGs already there
 *   npm run catalog -- --check   no PNGs needed: fail on a problem or a stale COMPONENTS.md
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cropShots } from "./crops.ts";
import { here, loadModel, markdown } from "./model.ts";

const index = join(here, "index.html");
const components = join(here, "COMPONENTS.md");
const check = process.argv.includes("--check");

if (!check && !process.argv.includes("--no-shots")) {
  // The PNGs are not committed: drawing them is what the e2e run does when asked to (E2E_PNG).
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

const md = markdown(model);
if (check) {
  const current = existsSync(components) ? readFileSync(components, "utf8") : "";
  if (current !== md) {
    console.error("catalog: kit/catalog/COMPONENTS.md is out of date; run `npm run catalog`");
    process.exit(1);
  }
  console.log("catalog: ok");
  process.exit(0);
}
writeFileSync(components, md);
cropShots(model);

const style = readFileSync(join(here, "page.css"), "utf8");

/** Pixel size of the PNG the page will show, so it can lay images out before they load. */
function pixels(shot: { src: string; crop?: string }): { pw?: number; ph?: number } {
  const file = join(here, shot.crop ?? shot.src);
  if (!existsSync(file)) return {};
  const head = readFileSync(file).subarray(0, 24);
  return { pw: head.readUInt32BE(16), ph: head.readUInt32BE(20) };
}

const data = JSON.stringify({
  components: model.components.map((c) => ({
    ...c,
    stories: c.stories.map((s) => ({
      ...s,
      by: Object.fromEntries(
        Object.entries(s.by).map(([k, own]) => [
          k,
          { ...own, shots: own.shots.map((x) => ({ ...x, ...pixels(x) })) },
        ]),
      ),
    })),
  })),
}).replace(/</g, "\\u003c");
const script = readFileSync(join(here, "page.js"), "utf8");

writeFileSync(
  index,
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kit catalogue</title>
<style>${style}</style></head><body>
<noscript><p>This page builds itself with a little script; enable it to read the catalogue.</p></noscript>
<div id="app"></div>
<script type="application/json" id="model">${data}</script>
<script>${script}</script>
</body></html>
`,
);
console.log(index);
