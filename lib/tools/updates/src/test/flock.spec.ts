/**
 * How the specs find the real flock(2) helper. These cases exist because an earlier version fell
 * back to another interpreter when the C helper could not be built, which would have made a broken
 * helper look like a passing suite.
 */
import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { flockHelperForTests, helperSource, resolveFlockHelper } from "./flock.ts";

const scratch: string[] = [];
const directory = (): string => {
  const path = fs.mkdtempSync(join(os.tmpdir(), "agents-flock-resolve-"));
  scratch.push(path);
  return path;
};
afterEach(() => {
  for (const path of scratch.splice(0)) fs.rmSync(path, { recursive: true, force: true });
});

const noPath = () => undefined;

test("the C helper compiles and is executable", () => {
  const helper = flockHelperForTests();
  assert.ok(fs.statSync(helper).isFile());
  assert.ok((fs.statSync(helper).mode & 0o111) !== 0);
  assert.equal(flockHelperForTests(), helper, "the compiled helper is reused");
  assert.ok(fs.existsSync(helperSource()), "the source the helper is built from exists");
});

test("an explicit AGENTS_FLOCK that is not executable fails instead of falling back", () => {
  assert.throws(
    () =>
      resolveFlockHelper({
        env: { AGENTS_FLOCK: "/nonexistent/agents-flock" },
        which: () => "/usr/bin/cc",
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /AGENTS_FLOCK=\/nonexistent\/agents-flock is not an executable file/,
      );
      return true;
    },
  );
});

test("a compiler that fails is reported, not hidden behind another helper", () => {
  assert.throws(
    () =>
      resolveFlockHelper({
        env: {},
        which: (name) => (name === "cc" ? "/usr/bin/cc" : undefined),
        makeDirectory: directory,
        compile: () => {
          throw new Error(
            "agents-flock.c:3:10: fatal error: sys/file.h: No such file or directory",
          );
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /cannot build .*agents-flock\.c with \/usr\/bin\/cc/);
      assert.match(error.message, /fatal error: sys\/file\.h/);
      return true;
    },
  );
});

test("no helper and no compiler says how to provide one", () => {
  assert.throws(
    () => resolveFlockHelper({ env: {}, which: noPath }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /no flock helper for the specs/);
      assert.match(error.message, /set AGENTS_FLOCK/);
      return true;
    },
  );
});

test("an AGENTS_FLOCK that is executable is used as it is", () => {
  const helper = join(directory(), "agents-flock");
  fs.writeFileSync(helper, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  assert.equal(resolveFlockHelper({ env: { AGENTS_FLOCK: helper }, which: noPath }), helper);
});
