// Writes site/data/content.json: the site's content model, loaded here and read there as data.
// The pages then need no file outside site/ (see docs/layout.md), and the site build needs neither
// this checkout's markdown nor `yaml`. Run by `just site` and `just site-build`, and by the Pages
// workflow after it records the media.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { loadContent, repoRoot } from "./content.ts";

const file = join(repoRoot, "site/data/content.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(loadContent(repoRoot), null, 2) + "\n");
console.log(`site-data: ${relative(repoRoot, file)}`);
