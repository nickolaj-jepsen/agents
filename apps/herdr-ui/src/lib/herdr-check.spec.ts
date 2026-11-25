// Herdr's own compile check of a mod: `herdr-app check <mod>` type-checks `main.js` and the files it
// imports against the kit the app hands a mod (`gpui-kit`, `gpui-base`, `herdr`). It writes
// `gpui-kit.d.ts` and `jsconfig.json` into the folder it checks, so it runs on a scratch copy: the
// artifact holds the mods and the layout and nothing else (see artifact.spec.ts).
//
// The app is not a dependency of this repo, so without it there is nothing to check with and the specs
// skip: `herdr-app` on `PATH`, or `HERDR_APP=/path/to/herdr-app pnpm turbo run test --filter=...`.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";

const mods = fileURLToPath(new URL("../mods", import.meta.url));

/** The Herdr app to check with: `HERDR_APP`, or the one on `PATH`. */
const app =
  process.env.HERDR_APP ??
  (process.env.PATH ?? "")
    .split(delimiter)
    .map((dir) => join(dir, "herdr-app"))
    .find((file) => existsSync(file));

/** A copy of the mods to check, so nothing the app generates lands in the app's sources. */
const scratch = app ? mkdtempSync(join(tmpdir(), "herdr-ui-check-")) : "";

if (app) cpSync(mods, scratch, { recursive: true });

afterAll(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

describe.skipIf(!app)("herdr-app check", () => {
  for (const { name } of app ? readdirSync(mods, { withFileTypes: true }) : []) {
    test(`${name} compiles`, () => {
      let output = "";
      try {
        output = execFileSync(app as string, ["check", join(scratch, name)], {
          encoding: "utf8",
          stdio: "pipe",
          timeout: 120_000,
        });
      } catch (error) {
        const { stdout, stderr } = error as { stdout?: string; stderr?: string };
        output = `${stdout ?? ""}${stderr ?? ""}`;
      }
      expect(output).toContain(`check passed: ${join(scratch, name)}`);
    });
  }
});
