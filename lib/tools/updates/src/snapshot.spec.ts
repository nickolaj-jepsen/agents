/**
 * What a published snapshot carries, and what it refuses.
 *
 * A published tree must refer only to itself: a link into the live checkout (or anywhere else
 * outside the snapshot) would let the store copy change under a harness later, and a link to a file
 * the snapshot does not carry would only dangle.
 */
import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import { UpdatesError } from "./core/errors.ts";
import { Fixture, commitAll, runGit } from "./test/fixture.ts";
import { publishSnapshot, repositoryPath } from "./snapshot.ts";

let fixture: Fixture | undefined;
afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});

const set = (): Fixture => (fixture = new Fixture());
const snapshotDir = (f: Fixture): string => join(f.temporary, "snapshot");

test("publishes tracked and untracked files and skips ignored ones", () => {
  const f = set();
  fs.writeFileSync(join(f.checkout, "stray.txt"), "untracked\n");
  fs.mkdirSync(join(f.checkout, "node_modules"));
  fs.writeFileSync(join(f.checkout, "node_modules", "junk.js"), "ignored\n");
  fs.writeFileSync(join(f.checkout, "apps", "answer", "src", "index.ts"), "// edited\n");
  const destination = snapshotDir(f);
  const snapshot = publishSnapshot(f.checkout, destination);
  assert.ok(fs.statSync(join(destination, "stray.txt")).isFile());
  assert.ok(fs.statSync(join(destination, "apps", "answer", "src", "index.ts")).isFile());
  assert.equal(fs.existsSync(join(destination, "node_modules")), false);
  assert.equal(fs.existsSync(join(destination, ".git")), false);
  assert.equal(snapshot.revision, f.head());
  assert.ok(snapshot.dirty >= 2);
  assert.ok(snapshot.files > 5);
});

test("keeps relative symlinks and rewrites absolute ones into the snapshot", () => {
  const f = set();
  fs.symlinkSync("skills/demo", join(f.checkout, "relative-link"));
  fs.symlinkSync(
    fs.realpathSync(join(f.checkout, "skills", "demo")),
    join(f.checkout, "absolute-link"),
  );
  commitAll(f.checkout, "links");
  const destination = snapshotDir(f);
  publishSnapshot(f.checkout, destination);
  assert.equal(fs.readlinkSync(join(destination, "relative-link")), "skills/demo");
  // The rewritten link must resolve inside the snapshot, not back to the checkout.
  const link = join(destination, "absolute-link");
  const text = fs.readlinkSync(link);
  assert.equal(text.startsWith("/"), false, "the link text is not absolute");
  assert.equal(fs.realpathSync(link), fs.realpathSync(join(destination, "skills", "demo")));
  assert.ok(fs.statSync(join(destination, "absolute-link", "SKILL.md")).isFile());
});

test("an absolute link outside the checkout is refused", () => {
  const f = set();
  const outside = join(f.temporary, "outside");
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, join(f.checkout, "outside-link"));
  commitAll(f.checkout, "outside");
  assert.throws(
    () => publishSnapshot(f.checkout, snapshotDir(f)),
    (error: unknown) => {
      assert.ok(error instanceof UpdatesError);
      assert.match(error.message, /outside the checkout/);
      assert.match(error.message, /point it at a tracked path inside the checkout/);
      return true;
    },
  );
});

test("a tracked link chain is flattened to its final target", () => {
  // git lists a-link before b-link, so validating links in place would find b-link's snapshot copy
  // missing. Both links must resolve to the published skills/demo.
  const f = set();
  fs.symlinkSync("b-link", join(f.checkout, "a-link"));
  fs.symlinkSync("skills/demo", join(f.checkout, "b-link"));
  fs.symlinkSync("y-link", join(f.checkout, "z-link"));
  fs.symlinkSync("skills/demo", join(f.checkout, "y-link"));
  commitAll(f.checkout, "chain");
  const destination = snapshotDir(f);
  publishSnapshot(f.checkout, destination);
  for (const name of ["a-link", "b-link", "y-link", "z-link"]) {
    assert.equal(fs.readlinkSync(join(destination, name)), "skills/demo", name);
    assert.equal(
      fs.realpathSync(join(destination, name)),
      fs.realpathSync(join(destination, "skills", "demo")),
      name,
    );
  }
});

test("a chain that leaves the checkout is refused", () => {
  const f = set();
  fs.symlinkSync("escape-link", join(f.checkout, "chain-link"));
  fs.symlinkSync("../../etc/passwd", join(f.checkout, "escape-link"));
  commitAll(f.checkout, "chain");
  assert.throws(
    () => publishSnapshot(f.checkout, snapshotDir(f)),
    (error: unknown) => {
      assert.ok(error instanceof UpdatesError);
      assert.match(error.message, /outside the checkout/);
      return true;
    },
  );
});

test("a link to a file the snapshot does not carry is refused", () => {
  // The snapshot carries only tracked + untracked-not-ignored files, so a link into an ignored
  // directory has no copy to point at, and keeping the live path would make it mutable.
  const f = set();
  fs.mkdirSync(join(f.checkout, "node_modules"));
  fs.writeFileSync(join(f.checkout, "node_modules", "dep.js"), "x\n");
  fs.symlinkSync(
    fs.realpathSync(join(f.checkout, "node_modules", "dep.js")),
    join(f.checkout, "ignored-link"),
  );
  runGit(f.checkout, "add", "-f", "ignored-link");
  commitAll(f.checkout, "ignored");
  assert.throws(
    () => publishSnapshot(f.checkout, snapshotDir(f)),
    (error: unknown) => {
      assert.ok(error instanceof UpdatesError);
      assert.match(error.message, /the snapshot does not carry/);
      assert.match(error.message, /commit that target/);
      return true;
    },
  );
});

test("a relative link that escapes the snapshot is refused", () => {
  const f = set();
  fs.symlinkSync("../../etc/passwd", join(f.checkout, "escape-link"));
  fs.symlinkSync("..", join(f.checkout, "dotdot-link"));
  commitAll(f.checkout, "escape");
  for (const name of ["escape-link", "dotdot-link"]) {
    assert.throws(
      () => publishSnapshot(f.checkout, snapshotDir(f)),
      (error: unknown) => {
        assert.ok(error instanceof UpdatesError);
        assert.match(error.message, /outside the checkout/);
        return true;
      },
      name,
    );
  }
});

test("a relative link to a published path is kept", () => {
  const f = set();
  fs.mkdirSync(join(f.checkout, "nested"));
  fs.symlinkSync("../skills/demo/SKILL.md", join(f.checkout, "nested", "link"));
  commitAll(f.checkout, "nested");
  const destination = snapshotDir(f);
  publishSnapshot(f.checkout, destination);
  assert.equal(fs.readlinkSync(join(destination, "nested", "link")), "../skills/demo/SKILL.md");
  assert.ok(fs.statSync(join(destination, "nested", "link")).isFile());
  assert.equal(
    fs.realpathSync(join(destination, "nested", "link")),
    fs.realpathSync(join(destination, "skills", "demo", "SKILL.md")),
  );
});

test("the update refuses a mutable link without touching state", async () => {
  const f = set();
  fs.symlinkSync("../../etc/passwd", join(f.checkout, "escape-link"));
  commitAll(f.checkout, "escape");
  const { code, out, err } = await f.update("answer");
  assert.equal(code, 1);
  assert.match(err, /outside the checkout/);
  assert.equal(fs.existsSync(f.current), false);
  assert.equal(out, "");
});

test("repositoryPath refuses a symlink out of the tree", () => {
  const f = set();
  fs.mkdirSync(join(f.checkout, "apps"), { recursive: true });
  const outside = join(f.temporary, "outside");
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, join(f.checkout, "apps", "evil"));
  assert.throws(() => repositoryPath(f.checkout, "apps", "evil", "package.json"), UpdatesError);
});

test("repositoryPath accepts a path inside", () => {
  const f = set();
  fs.mkdirSync(join(f.checkout, "apps", "good"), { recursive: true });
  fs.writeFileSync(join(f.checkout, "apps", "good", "package.json"), "{}");
  assert.ok(fs.statSync(repositoryPath(f.checkout, "apps", "good", "package.json")).isFile());
});
