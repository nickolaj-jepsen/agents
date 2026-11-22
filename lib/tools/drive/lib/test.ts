/**
 * `drive test <package>`: plays every scenario of a package in its real agent and compares the
 * screen at each size with its stored snapshot (`e2e.spec.ts`, run by vitest's node API).
 */
import { join } from "node:path";
import { packagesNamed } from "./find.ts";
import { type Options, setOptions } from "./options.ts";
import { driveRoot } from "./scenario.ts";

/** Runs the package's tests; true when they all passed. */
export async function runTests(
  pkg: string | undefined,
  o: Pick<Options, "update" | "png" | "keep" | "jobs" | "timing" | "tmp"> & { filter?: string },
): Promise<boolean> {
  // A name that is no package fails here, before vitest starts. `kit` and `apps` are several.
  packagesNamed(pkg);
  setOptions({ ...o, package: pkg });
  // Resolved after the options are set: the workers it starts inherit them.
  const { startVitest } = await import("vitest/node");
  const vitest = await startVitest(
    "test",
    [],
    {
      run: true,
      watch: false,
      config: join(driveRoot, "vitest.config.ts"),
      root: driveRoot,
      // The runner plays only the scenarios the pattern picks (`options.filter`); vitest then runs those tests.
      testNamePattern: o.filter,
    },
    {},
    {},
  );
  const ok =
    !!vitest &&
    !vitest.state.getFiles().some((f) => f.result?.state === "fail") &&
    !process.exitCode;
  await vitest?.close();
  return ok;
}
