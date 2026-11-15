/**
 * `just kit-sync [plugin...]`: rewrites every copy of the Claude kit from `kit/claude/ui.tsx`
 * and the catalogue mod's copy of the samples, and makes a kit copy for each plugin named.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { pairs, root } from "./copies.ts";

for (const { source, file } of pairs(process.argv.slice(2))) {
  // An untouched copy stays untouched: a running dev session reloads a mod on any write.
  if (existsSync(file) && readFileSync(file, "utf8") === readFileSync(source, "utf8")) continue;
  mkdirSync(dirname(file), { recursive: true });
  copyFileSync(source, file);
  console.log(`kit-sync: ${relative(root, file)}`);
}
