/**
 * `just kit-sync [plugin...]`: rewrites every copy of the kit's sources and removes what a copy
 * holds that the kit no longer has. A plugin named gets a copy of the kit. See `copies.ts`.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, relative } from "node:path";
import { pairs, root, strays } from "./copies.ts";

const add = process.argv.slice(2);
for (const { source, file } of pairs(add)) {
  // An untouched copy stays untouched: a running dev session reloads a mod on any write.
  if (existsSync(file) && readFileSync(file, "utf8") === readFileSync(source, "utf8")) continue;
  mkdirSync(dirname(file), { recursive: true });
  copyFileSync(source, file);
  console.log(`kit-sync: ${relative(root, file)}`);
}
for (const file of strays(add)) {
  rmSync(file);
  console.log(`kit-sync: removed ${relative(root, file)}`);
}
