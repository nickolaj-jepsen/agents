/**
 * The ownership-aware deployer for Herdr's writable UI tree: which files it writes, which it
 * leaves exactly as they were, and which it removes — and that a failure puts the tree back.
 */
import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import {
  DeployError,
  type DeployIo,
  type DeployResult,
  configHome,
  deploy,
  destination,
  recordPath,
  safeRelative,
} from "./ui.ts";

const scratch: string[] = [];
afterEach(() => {
  for (const directory of scratch.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

type Recorder = {
  lines: string[];
  warnings: string[];
  say: (m?: string) => void;
  warn: (m: string) => void;
};
const recorder = (): Recorder => {
  const lines: string[] = [];
  const warnings: string[] = [];
  return { lines, warnings, say: (m = "") => lines.push(m), warn: (m) => warnings.push(m) };
};

const ARTIFACT: Record<string, string> = {
  "mods/demo/main.js": "// main\n",
  "mods/demo/mod.json": '{"place": "none"}\n',
  "mods/demo/helper.js": "export const helper = 1;\n",
  "mods/demo/mark.svg": "<svg/>\n",
  "mods/other/main.js": "// other\n",
  "mods/other/mod.json": '{"place": "none"}\n',
  "layouts/nested.json": '{"id": "root"}\n',
};

class Fixture {
  readonly temporary: string;
  readonly source: string;
  readonly destination: string;
  readonly state: string;
  readonly console: Recorder;

  constructor(files: Record<string, string> = ARTIFACT) {
    this.temporary = fs.mkdtempSync(join(os.tmpdir(), "agents-ui-test-"));
    scratch.push(this.temporary);
    this.console = recorder();
    this.source = join(this.temporary, "artifact");
    this.destination = join(this.temporary, "config", "herdr-app");
    this.state = join(this.temporary, "state");
    this.artifact(files);
  }

  artifact(files: Record<string, string>, root = this.source): void {
    for (const [relative, text] of Object.entries(files)) {
      const path = join(root, relative);
      fs.mkdirSync(join(path, ".."), { recursive: true });
      fs.writeFileSync(path, text);
    }
  }

  deploy(
    options: { dryRun?: boolean; source?: string; destination?: string; io?: DeployIo } = {},
  ): DeployResult {
    return deploy(
      "herdr-ui",
      options.source ?? this.source,
      options.destination ?? this.destination,
      this.state,
      this.console,
      options.dryRun ?? false,
      options.io ?? {},
    );
  }

  deployed(relative: string): string {
    return fs.readFileSync(join(this.destination, relative), "utf8");
  }

  record(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(recordPath(this.state, "herdr-ui"), "utf8"));
  }
}

const set = (files?: Record<string, string>): Fixture => new Fixture(files);

const write = (path: string, text: string): void => {
  fs.mkdirSync(join(path, ".."), { recursive: true });
  fs.writeFileSync(path, text);
};

// -- where a target goes ------------------------------------------------------------------------

test("herdr-ui goes to the app's config directory", () => {
  assert.equal(
    destination("herdr-ui", { XDG_CONFIG_HOME: "/home/u/.config" }),
    "/home/u/.config/herdr-app",
  );
  assert.equal(destination("herdr-ui", { HOME: "/home/u" }), "/home/u/.config/herdr-app");
  assert.equal(configHome({ HOME: "/home/u" }), "/home/u/.config");
});

test("AGENTS_UI_DIR wins for any name", () => {
  const env = { XDG_CONFIG_HOME: "/home/u/.config", AGENTS_UI_DIR: "/tmp/tree" };
  assert.equal(destination("herdr-ui", env), "/tmp/tree");
  assert.equal(destination("other-ui", env), "/tmp/tree");
});

test("an unknown target without an override is refused", () => {
  assert.throws(() => destination("nope", { HOME: "/home/u" }), /no deployment directory is known/);
});

test("accepts the artifact's paths and refuses escapes and foreign folders", () => {
  for (const path of ["mods/demo/main.js", "layouts/a.json", "mods/a/b/c.js"]) safeRelative(path);
  for (const path of [
    "",
    "../x",
    "/abs/path",
    "mods/../x",
    "mods//x",
    "mods/./x",
    "shared.json",
    "mods",
    "top/x",
    "mods\\x",
  ]) {
    assert.throws(() => safeRelative(path), DeployError, JSON.stringify(path));
  }
  assert.throws(() => safeRelative("mods/a\0b"), DeployError);
});

// -- the deploy ---------------------------------------------------------------------------------

test("a first deploy writes every file as a real file, helpers before entry points then layouts", () => {
  const f = set();
  const result = f.deploy();
  assert.equal(result.unchanged, 0);
  assert.deepEqual(result.written, [
    "mods/demo/helper.js",
    "mods/demo/mark.svg",
    "mods/demo/main.js",
    "mods/demo/mod.json",
    "mods/other/main.js",
    "mods/other/mod.json",
    "layouts/nested.json",
  ]);
  assert.deepEqual(result.pruned, []);
  assert.equal(f.deployed("mods/demo/helper.js"), "export const helper = 1;\n");
  assert.equal(fs.lstatSync(join(f.destination, "mods/demo/main.js")).isSymbolicLink(), false);
  assert.ok(fs.statSync(join(f.destination, "layouts/nested.json")).isFile());
  const order = new Map(result.written.map((relative, index) => [relative, index]));
  assert.ok(order.get("mods/demo/helper.js")! < order.get("mods/demo/main.js")!);
  assert.ok(order.get("mods/demo/mark.svg")! < order.get("mods/demo/mod.json")!);
  assert.ok(order.get("mods/other/mod.json")! < order.get("layouts/nested.json")!);
  assert.equal(result.written.at(-1), "layouts/nested.json");
  assert.equal(fs.statSync(join(f.destination, "mods/demo/main.js")).mode & 0o777, 0o644);
  assert.deepEqual(
    fs.readdirSync(f.destination).filter((name) => name.startsWith(".")),
    [],
    "no scratch directory is left behind",
  );
});

test("the record names the source, the destination and every file", () => {
  const f = set();
  f.deploy();
  const record = f.record();
  assert.equal(record.name, "herdr-ui");
  assert.equal(record.source, fs.realpathSync(f.source));
  assert.equal(record.destination, fs.realpathSync(f.destination));
  assert.equal((record.files as string[]).length, 7);
  assert.ok((record.files as string[]).includes("mods/demo/main.js"));
});

test("an unchanged artifact writes nothing at all", () => {
  const f = set();
  f.deploy();
  const before = new Map([...walk(f.destination)].map((path) => [path, fs.statSync(path).mtimeMs]));
  const result = f.deploy();
  assert.deepEqual(result.written, []);
  assert.deepEqual(result.pruned, []);
  assert.equal(result.unchanged, 7);
  const after = new Map([...walk(f.destination)].map((path) => [path, fs.statSync(path).mtimeMs]));
  assert.deepEqual(after, before);
});

function* walk(directory: string): Generator<string> {
  for (const name of fs.readdirSync(directory)) {
    const path = join(directory, name);
    if (fs.statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

test("only the changed file is written", () => {
  const f = set();
  f.deploy();
  fs.writeFileSync(join(f.source, "mods/demo/helper.js"), "export const helper = 2;\n");
  const result = f.deploy();
  assert.deepEqual(result.written, ["mods/demo/helper.js"]);
  assert.equal(result.unchanged, 6);
  assert.equal(f.deployed("mods/demo/helper.js"), "export const helper = 2;\n");
});

test("files the artifact dropped are pruned and nothing else is", () => {
  const f = set();
  f.deploy();
  write(join(f.destination, "mods/demo/notes.md"), "mine\n");
  fs.writeFileSync(join(f.destination, "shared.json"), '{"layout": "nested"}\n');
  write(join(f.destination, "mods/mine/main.js"), "// mine\n");
  fs.rmSync(join(f.source, "mods/other/main.js"));
  fs.rmSync(join(f.source, "mods/other/mod.json"));
  const result = f.deploy();
  assert.deepEqual([...result.pruned].sort(), ["mods/other/main.js", "mods/other/mod.json"]);
  assert.equal(fs.existsSync(join(f.destination, "mods/other")), false);
  assert.ok(fs.existsSync(join(f.destination, "mods/demo/notes.md")));
  assert.ok(fs.existsSync(join(f.destination, "mods/mine/main.js")));
  assert.equal(f.deployed("shared.json"), '{"layout": "nested"}\n');
  assert.equal((f.record().files as string[]).length, 5);
});

test("a file the record never claimed is never pruned", () => {
  const f = set();
  f.deploy();
  write(join(f.destination, "mods/gone/main.js"), "// someone else's\n");
  fs.rmSync(join(f.source, "mods/other/main.js"));
  fs.rmSync(join(f.source, "mods/other/mod.json"));
  const result = f.deploy();
  assert.equal(result.pruned.includes("mods/gone/main.js"), false);
  assert.ok(fs.existsSync(join(f.destination, "mods/gone/main.js")));
});

test("a dry run writes nothing and records nothing", () => {
  const f = set();
  fs.mkdirSync(join(f.destination, "mods/demo"), { recursive: true });
  fs.writeFileSync(join(f.destination, "mods/demo/main.js"), "old\n");
  const result = f.deploy({ dryRun: true });
  assert.equal(result.written.length, 7);
  assert.equal(f.deployed("mods/demo/main.js"), "old\n");
  assert.equal(fs.existsSync(join(f.destination, "mods/demo/helper.js")), false);
  assert.equal(fs.existsSync(recordPath(f.state, "herdr-ui")), false);
});

// -- ownership and symlinks ---------------------------------------------------------------------

test("an unmanaged symlink at a deployed path is left alone", () => {
  const f = set();
  const target = join(f.destination, "mods/demo/main.js");
  fs.mkdirSync(join(target, ".."), { recursive: true });
  const elsewhere = join(f.temporary, "elsewhere.js");
  fs.writeFileSync(elsewhere, "// home-manager's\n");
  fs.symlinkSync(elsewhere, target);
  const result = f.deploy();
  assert.ok(result.skipped.some(([relative]) => relative === "mods/demo/main.js"));
  assert.equal(fs.readFileSync(target, "utf8"), "// home-manager's\n");
  assert.ok(fs.lstatSync(target).isSymbolicLink());
  assert.equal((f.record().files as string[]).includes("mods/demo/main.js"), false);
});

test("a recorded path taken over by a symlink is left alone and stops being ours", () => {
  const f = set();
  f.deploy();
  const elsewhere = join(f.temporary, "taken-over.js");
  fs.writeFileSync(elsewhere, "// someone else's\n");
  const target = join(f.destination, "mods/demo/main.js");
  fs.rmSync(target);
  fs.symlinkSync(elsewhere, target);
  fs.writeFileSync(join(f.source, "mods/demo/main.js"), "// new upstream\n");
  const result = f.deploy();
  assert.ok(result.skipped.some(([relative]) => relative === "mods/demo/main.js"));
  assert.ok(fs.lstatSync(target).isSymbolicLink());
  assert.equal(fs.readFileSync(target, "utf8"), "// someone else's\n");
  assert.equal((f.record().files as string[]).includes("mods/demo/main.js"), false);
});

test("a failed deploy never deletes a symlink that took a path over", () => {
  const f = set();
  f.deploy();
  const elsewhere = join(f.temporary, "taken-over.js");
  fs.writeFileSync(elsewhere, "// someone else's\n");
  const target = join(f.destination, "mods/demo/main.js");
  fs.rmSync(target);
  fs.symlinkSync(elsewhere, target);
  fs.writeFileSync(join(f.source, "mods/demo/helper.js"), "// changed\n");
  let calls = 0;
  assert.throws(() =>
    f.deploy({
      io: {
        replace: (from, to) => {
          calls += 1;
          if (calls === 2) throw new Error("disk full");
          fs.renameSync(from, to);
        },
      },
    }),
  );
  assert.ok(fs.lstatSync(target).isSymbolicLink());
  assert.equal(fs.readFileSync(target, "utf8"), "// someone else's\n");
});

test("a symlinked mod directory inside the tree is left alone, and other mods deploy", () => {
  const f = set();
  const shared = join(f.destination, "mods/shared-demo");
  fs.mkdirSync(shared, { recursive: true });
  fs.writeFileSync(join(shared, "main.js"), "// linked\n");
  fs.symlinkSync("shared-demo", join(f.destination, "mods/demo"));
  const result = f.deploy();
  assert.ok(result.skipped.some(([relative]) => relative.startsWith("mods/demo/")));
  assert.equal(fs.readFileSync(join(shared, "main.js"), "utf8"), "// linked\n");
  assert.ok(fs.existsSync(join(f.destination, "mods/other/main.js")));
});

test("a symlinked directory that escapes the tree is refused", () => {
  const f = set();
  const outside = join(f.temporary, "outside");
  fs.mkdirSync(outside);
  fs.mkdirSync(join(f.destination, "mods"), { recursive: true });
  fs.symlinkSync(outside, join(f.destination, "mods/demo"));
  assert.throws(() => f.deploy(), DeployError);
  assert.deepEqual(fs.readdirSync(outside), []);
});

// -- the record ---------------------------------------------------------------------------------

test("a record made for another destination prunes nothing there", () => {
  const f = set();
  f.deploy();
  const other = join(f.temporary, "other-config");
  fs.mkdirSync(join(other, "mods/other"), { recursive: true });
  fs.writeFileSync(join(other, "mods/other/main.js"), "// stale\n");
  fs.rmSync(join(f.source, "mods/other/main.js"));
  fs.rmSync(join(f.source, "mods/other/mod.json"));
  const result = f.deploy({ destination: other });
  assert.deepEqual(result.pruned, []);
  assert.ok(fs.existsSync(join(other, "mods/other/main.js")));
});

test("an unreadable record is reported and claims nothing", () => {
  const f = set();
  const record = recordPath(f.state, "herdr-ui");
  fs.mkdirSync(join(record, ".."), { recursive: true });
  fs.writeFileSync(record, "{not json");
  const result = f.deploy();
  assert.equal(result.written.length, 7);
  assert.ok(f.console.warnings.length > 0);
  assert.match(
    f.console.warnings[0]!,
    /the ownership record .* is unreadable .*no deployed file will be pruned/,
  );
  assert.equal((f.record().files as string[]).length, 7);
});

test("a record naming an escape is never acted on", () => {
  const f = set();
  f.deploy();
  const outside = join(f.temporary, "outside.js");
  fs.writeFileSync(outside, "// keep me\n");
  const record = f.record();
  (record.files as string[]).push("../outside.js", "shared.json");
  fs.writeFileSync(recordPath(f.state, "herdr-ui"), JSON.stringify(record));
  fs.writeFileSync(join(f.destination, "shared.json"), "{}\n");
  fs.rmSync(join(f.source, "mods/other/main.js"));
  fs.rmSync(join(f.source, "mods/other/mod.json"));
  const result = f.deploy();
  assert.deepEqual([...result.pruned].sort(), ["mods/other/main.js", "mods/other/mod.json"]);
  assert.ok(fs.existsSync(outside));
  assert.ok(fs.existsSync(join(f.destination, "shared.json")));
});

// -- the artifact -------------------------------------------------------------------------------

test("a symlink inside the artifact is deployed as the file it names", () => {
  const f = set();
  fs.writeFileSync(join(f.source, "mods/demo/real.js"), "// real\n");
  fs.symlinkSync("real.js", join(f.source, "mods/demo/linked.js"));
  const result = f.deploy();
  assert.ok(result.written.includes("mods/demo/linked.js"));
  const deployed = join(f.destination, "mods/demo/linked.js");
  assert.equal(fs.lstatSync(deployed).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(deployed, "utf8"), "// real\n");
});

test("a symlink that resolves outside the artifact is refused", () => {
  const f = set();
  const outside = join(f.temporary, "outside.js");
  fs.writeFileSync(outside, "// elsewhere\n");
  fs.symlinkSync(outside, join(f.source, "mods/demo/linked.js"));
  assert.throws(() => f.deploy(), DeployError);
  assert.equal(fs.existsSync(f.destination), false);
});

test("an artifact without a managed folder is refused", () => {
  const f = set();
  const plain = join(f.temporary, "plain");
  fs.mkdirSync(plain);
  fs.writeFileSync(join(plain, "main.js"), "// not a UI artifact\n");
  assert.throws(() => f.deploy({ source: plain }), DeployError);
});

test("a file outside the managed folders is refused", () => {
  const f = set();
  fs.writeFileSync(join(f.source, "shared.json"), "{}\n");
  assert.throws(() => f.deploy(), DeployError);
  assert.equal(fs.existsSync(join(f.destination, "shared.json")), false);
});

test("a missing artifact is refused", () => {
  const f = set();
  assert.throws(() => f.deploy({ source: join(f.temporary, "no-such-artifact") }), DeployError);
});

// -- rollback -----------------------------------------------------------------------------------

test("a failed write leaves the tree it found and the record it had", () => {
  const f = set();
  f.deploy();
  fs.writeFileSync(join(f.destination, "mods/demo/helper.js"), "// mine\n");
  const before = f.record();
  fs.writeFileSync(join(f.source, "mods/demo/helper.js"), "// new helper\n");
  fs.writeFileSync(join(f.source, "mods/demo/main.js"), "// new main\n");
  let calls = 0;
  assert.throws(() =>
    f.deploy({
      io: {
        replace: (from, to) => {
          calls += 1;
          if (calls === 2) throw new Error("disk full");
          fs.renameSync(from, to);
        },
      },
    }),
  );
  assert.equal(f.deployed("mods/demo/helper.js"), "// mine\n");
  assert.deepEqual(f.record(), before);
});

test("a failed first write leaves no file and no record behind", () => {
  const f = set();
  assert.throws(() =>
    f.deploy({
      io: {
        replace: () => {
          throw new Error("disk full");
        },
      },
    }),
  );
  assert.equal(fs.existsSync(join(f.destination, "mods/demo/helper.js")), false);
  assert.equal(fs.existsSync(recordPath(f.state, "herdr-ui")), false);
});

test("a record that cannot be written rolls the files back", () => {
  // The record is the ledger a later prune trusts: a deploy that cannot record itself leaves
  // neither the files nor a record that differs from them.
  const f = set();
  f.deploy();
  const before = f.record();
  fs.writeFileSync(join(f.source, "mods/demo/helper.js"), "// new helper\n");
  fs.writeFileSync(join(f.source, "mods/demo/main.js"), "// new main\n");
  assert.throws(() =>
    f.deploy({
      io: {
        saveRecord: () => {
          throw new Error("disk full");
        },
      },
    }),
  );
  assert.equal(f.deployed("mods/demo/helper.js"), "export const helper = 1;\n");
  assert.equal(f.deployed("mods/demo/main.js"), "// main\n");
  assert.deepEqual(f.record(), before);
});

test("a rollback restores by rename and never truncates a file", () => {
  // The tree is watched: a restore that truncated a mod would expose a half-written file to the app.
  // The third rename — the ownership record's — fails, so two files were replaced and both must come
  // back through a rename of their own.
  const f = set();
  f.deploy();
  fs.writeFileSync(join(f.source, "mods/demo/helper.js"), "// new helper\n");
  fs.writeFileSync(join(f.source, "mods/demo/main.js"), "// new main\n");
  let calls = 0;
  assert.throws(() =>
    f.deploy({
      io: {
        replace: (from, to) => {
          calls += 1;
          if (calls === 3) throw new Error("disk full");
          fs.renameSync(from, to);
        },
        writeFile: () => {
          throw new Error("a rollback truncated a file instead of renaming over it");
        },
      },
    }),
  );
  assert.equal(f.deployed("mods/demo/helper.js"), "export const helper = 1;\n");
  assert.equal(f.deployed("mods/demo/main.js"), "// main\n");
  assert.deepEqual(
    fs.readdirSync(f.destination).filter((name) => name.startsWith(".")),
    [],
  );
});

test("a failed prune restores what it removed", () => {
  const f = set();
  f.deploy();
  fs.rmSync(join(f.source, "mods/other/main.js"));
  fs.rmSync(join(f.source, "mods/other/mod.json"));
  let calls = 0;
  assert.throws(() =>
    f.deploy({
      io: {
        removeEmpty: () => {
          calls += 1;
          if (calls === 1) throw new Error("busy");
          // The default removeEmpty is not reached after the throw; nothing else to do.
        },
      },
    }),
  );
  assert.ok(fs.existsSync(join(f.destination, "mods/other/main.js")));
  assert.equal((f.record().files as string[]).length, 7);
});
