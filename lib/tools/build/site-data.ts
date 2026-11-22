// Resolve checkout content before Astro runs so the site can build from its own folder.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { loadContent, repoRoot } from "./content.ts";

const file = join(repoRoot, "site/data/content.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(loadContent(repoRoot), null, 2) + "\n");
console.log(`site-data: ${relative(repoRoot, file)}`);
