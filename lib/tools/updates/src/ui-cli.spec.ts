/**
 * Herdr's UI artifact through the CLI: detected from its manifest, built as the flake's own
 * package, deployed into the writable config directory, and undone by a reset — with the state file
 * and the deployed tree never disagreeing.
 */
import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import { NEXT_REVISION, REVISION, Fixture, commitAll } from "./test/fixture.ts";

let fixture: Fixture | undefined;
afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});

const set = (): Fixture => (fixture = new Fixture());
const deployedRoot = (f: Fixture): string => join(f.configHome, "herdr-app");
const deployedText = (f: Fixture, relative: string): string =>
  fs.readFileSync(join(deployedRoot(f), relative), "utf8");
const uiState = (f: Fixture): Record<string, any> => f.readState().ui ?? {};

test("update detects the UI artifact without a flag and deploys it", async () => {
  const f = set();
  const { code, out, err } = await f.update("herdr-ui");
  assert.equal(code, 0, err);
  assert.match(out, /herdr-ui ui: /);
  assert.match(out, /deployed/);
  const expression = f.expr();
  assert.match(expression, /flake\.packages\.\$\{system\}/);
  assert.match(expression, /name = "ui\/herdr-ui"/);
  assert.equal(expression.replace("pluginsFor pkgs", "").includes("pluginsFor"), false);
  assert.equal(uiState(f)["herdr-ui"].path, join(f.store, "out-ui-herdr-ui"));
  assert.equal(uiState(f)["herdr-ui"].baseline, REVISION);
  assert.equal(deployedText(f, "mods/demo/main.js"), "// main\n");
  assert.equal(deployedText(f, "layouts/nested.json"), '{"id":"root"}\n');
  assert.equal(fs.existsSync(join(deployedRoot(f), "shared.json")), false);
  // No claude half in the plan, so the expression must not wire mkClaudePlugin at all.
  assert.equal(expression.includes("mkClaude"), false);
  assert.equal(expression.includes("claude-code"), false);
});

test("the update says it did not restart or confirm anything", async () => {
  const f = set();
  const { code, out } = await f.update("herdr-ui");
  assert.equal(code, 0);
  assert.match(out, /no restart; Herdr watches these files/);
  assert.match(out, /not that a running app applied it/);
});

test("a second update writes nothing", async () => {
  const f = set();
  assert.equal((await f.update("herdr-ui")).code, 0);
  const { code, out } = await f.update("herdr-ui");
  assert.equal(code, 0);
  assert.match(out, /deployed 0 written/);
  assert.equal(out.includes("no restart"), false);
});

test("a UI dry run builds and deploys nothing", async () => {
  const f = set();
  const { code, out, err } = await f.update("herdr-ui", "--dry-run");
  assert.equal(code, 0, err);
  assert.match(out, /herdr-ui ui/);
  assert.match(out, new RegExp(`would deploy into ${deployedRoot(f)}`));
  assert.match(out, /nothing built, deployed or recorded/);
  assert.equal(f.expr(), "");
  assert.equal(fs.existsSync(f.current), false);
  assert.equal(fs.existsSync(deployedRoot(f)), false);
});

test("reset drops the override and deploys the baseline", async () => {
  const f = set();
  assert.equal((await f.update("herdr-ui")).code, 0);
  assert.equal(filesUnder(deployedRoot(f)).length, 4);
  const { code, out, err } = await f.runCli("reset", "herdr-ui");
  assert.equal(code, 0, err);
  assert.match(out, /herdr-ui \(ui\)/);
  assert.match(out, /deployed/);
  assert.deepEqual(uiState(f), {});
  assert.equal(deployedText(f, "mods/demo/main.js"), "// pinned\n");
  assert.equal(deployedText(f, "layouts/nested.json"), '{"id":"pinned"}\n');
  assert.equal(fs.existsSync(join(deployedRoot(f), "mods/demo/queue.js")), false);
  assert.equal(fs.existsSync(join(deployedRoot(f), "mods/demo/mod.json")), false);
});

function filesUnder(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const found: string[] = [];
  for (const name of fs.readdirSync(directory)) {
    const path = join(directory, name);
    if (fs.statSync(path).isDirectory()) found.push(...filesUnder(path));
    else found.push(path);
  }
  return found;
}

test("reset refuses a harness filter for a UI artifact and drops nothing", async () => {
  const f = set();
  assert.equal((await f.update("herdr-ui")).code, 0);
  const { code, err } = await f.runCli("reset", "herdr-ui", "--harness", "pi");
  assert.equal(code, 1);
  assert.match(err, /Herdr UI artifact/);
  assert.ok("herdr-ui" in uiState(f));
});

test("reset keeps the old root for a running session", async () => {
  const f = set();
  assert.equal((await f.update("herdr-ui")).code, 0);
  const roots = fs.readdirSync(join(f.state, "roots")).sort();
  assert.equal((await f.runCli("reset", "herdr-ui")).code, 0);
  assert.deepEqual(fs.readdirSync(join(f.state, "roots")).sort(), roots);
});

test("deploy-ui without any publication deploys the baseline", async () => {
  const f = set();
  const { code, out, err } = await f.runCli("deploy-ui", "herdr-ui");
  assert.equal(code, 0, err);
  assert.match(out, /deployed 2 written/);
  assert.match(out, /baseline/);
  assert.equal(deployedText(f, "mods/demo/main.js"), "// pinned\n");
  assert.equal(f.expr(), "");
});

test("deploy-ui is idempotent and writes only what changed", async () => {
  const f = set();
  assert.equal((await f.runCli("deploy-ui", "herdr-ui")).code, 0);
  const { code, out } = await f.runCli("deploy-ui", "herdr-ui");
  assert.equal(code, 0);
  assert.match(out, /deployed 0 written, 2 unchanged/);
  assert.equal(out.includes("no restart"), false);
});

test("deploy-ui honours a published override", async () => {
  const f = set();
  assert.equal((await f.update("herdr-ui")).code, 0);
  fs.writeFileSync(join(deployedRoot(f), "mods/demo/main.js"), "// edited\n");
  assert.equal((await f.runCli("deploy-ui", "herdr-ui")).code, 0);
  assert.equal(deployedText(f, "mods/demo/main.js"), "// main\n");
});

test("deploy-ui --dry-run writes nothing", async () => {
  const f = set();
  const { code, out, err } = await f.runCli("deploy-ui", "herdr-ui", "--dry-run");
  assert.equal(code, 0, err);
  assert.match(out, /would write/);
  assert.match(out, /would write mods\/demo\/main.js/);
  assert.equal(fs.existsSync(deployedRoot(f)), false);
  assert.equal(fs.existsSync(join(f.state, "ui", "herdr-ui.json")), false);
});

test("a published artifact that left the store falls back to the baseline", async () => {
  const f = set();
  assert.equal((await f.update("herdr-ui")).code, 0);
  fs.rmSync(join(f.store, "out-ui-herdr-ui"), { recursive: true, force: true });
  const { code, out, err } = await f.runCli("deploy-ui", "herdr-ui");
  assert.equal(code, 0, err);
  assert.match(err, /gone from the store/);
  assert.match(out, /baseline/);
  assert.equal(deployedText(f, "mods/demo/main.js"), "// pinned\n");
});

test("deploy-ui ignores a corrupt state and deploys the baseline", async () => {
  const f = set();
  fs.mkdirSync(f.state, { recursive: true });
  fs.writeFileSync(f.current, "{not json");
  const { code, err } = await f.runCli("deploy-ui", "herdr-ui");
  assert.equal(code, 0);
  assert.match(err, /deploying the baseline only/);
  assert.equal(deployedText(f, "mods/demo/main.js"), "// pinned\n");
});

test("deploy-ui refuses a target it cannot place, unless AGENTS_UI_DIR says where", async () => {
  const f = set();
  f.writeBaseline({ ui: { "mystery-ui": join(f.store, "baseline-herdr-ui") } });
  const refused = await f.runCli("deploy-ui", "mystery-ui");
  assert.equal(refused.code, 1);
  assert.match(refused.err, /no deployment directory is known/);
  const elsewhere = join(f.temporary, "elsewhere");
  const placed = await f.runCliWith(
    { ...f.env, AGENTS_UI_DIR: elsewhere },
    "deploy-ui",
    "mystery-ui",
  );
  assert.equal(placed.code, 0, placed.err);
  assert.ok(fs.existsSync(join(elsewhere, "mods/demo/main.js")));
});

test("deploy-ui without a baseline fails, and says when a name is in no baseline", async () => {
  const f = set();
  const env = { ...f.env };
  delete env.AGENTS_BASELINE;
  const missing = await f.runCliWith(env, "deploy-ui", "herdr-ui");
  assert.equal(missing.code, 1);
  assert.match(missing.err, /AGENTS_BASELINE is not set/);
  f.writeBaseline({ ui: {} });
  const unknown = await f.runCli("deploy-ui", "herdr-ui");
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /nothing to deploy/);
});

test("a state write that fails leaves the tree and the state alone", async () => {
  // The state write comes first and cannot land: nothing is deployed, so nothing can disagree with
  // the state that survived.
  const f = set();
  const { code, err } = await f.runCliWith(await readOnlyStateDir(f), "update", "herdr-ui");
  restorePermissions(f);
  assert.equal(code, 1);
  assert.match(err, /EACCES|permission denied/);
  assert.equal(fs.existsSync(f.current), false);
  assert.match(f.expr(), /name = "ui\/herdr-ui"/);
  assert.equal(fs.existsSync(deployedRoot(f)), false);
});

test("a config write that fails undoes the publication", async () => {
  // The mirror image: the state was written and the deploy failed, so the state is put back and
  // `resolve` keeps naming what the app is actually reading.
  const f = set();
  const blocked = join(f.temporary, "not-a-directory");
  fs.writeFileSync(blocked, "in the way\n");
  const { code, err } = await f.runCliWith(
    { ...f.env, AGENTS_UI_DIR: blocked },
    "update",
    "herdr-ui",
  );
  assert.equal(code, 1);
  assert.match(err, /is not a directory/);
  assert.equal(fs.existsSync(f.current), false, "the state file the run created is gone again");
  assert.deepEqual(JSON.parse((await f.runCli("resolve")).out).ui, {
    "herdr-ui": join(f.store, "baseline-herdr-ui"),
  });
});

test("a failed republish keeps the previous publication and its revision", async () => {
  const f = set();
  assert.equal((await f.update("herdr-ui")).code, 0);
  const before = fs.readFileSync(f.current);
  const deployed = deployedText(f, "mods/demo/main.js");
  const blocked = join(f.temporary, "not-a-directory");
  fs.writeFileSync(blocked, "in the way\n");
  const { code, err } = await f.runCliWith(
    { ...f.env, AGENTS_UI_DIR: blocked },
    "update",
    "herdr-ui",
  );
  assert.equal(code, 1);
  assert.match(err, /is not a directory/);
  assert.ok(fs.readFileSync(f.current).equals(before));
  assert.equal(deployedText(f, "mods/demo/main.js"), deployed);
  assert.deepEqual(JSON.parse((await f.runCli("resolve")).out).ui, {
    "herdr-ui": join(f.store, "out-ui-herdr-ui"),
  });
});

test("a failed reset keeps the publication and its pinned revision", async () => {
  const f = set();
  assert.equal((await f.update("herdr-ui")).code, 0);
  const before = fs.readFileSync(f.current);
  const deployed = deployedText(f, "mods/demo/main.js");
  const blocked = join(f.temporary, "not-a-directory");
  fs.writeFileSync(blocked, "in the way\n");
  const { code, err } = await f.runCliWith(
    { ...f.env, AGENTS_UI_DIR: blocked },
    "reset",
    "herdr-ui",
  );
  assert.equal(code, 1);
  assert.match(err, /is not a directory/);
  assert.ok(fs.readFileSync(f.current).equals(before));
  assert.equal(uiState(f)["herdr-ui"].baseline, REVISION);
  assert.equal(deployedText(f, "mods/demo/main.js"), deployed);
});

test("a reset whose state write fails deploys nothing", async () => {
  const f = set();
  assert.equal((await f.update("herdr-ui")).code, 0);
  const before = fs.readFileSync(f.current);
  const { code, err } = await f.runCliWith(await readOnlyStateDir(f), "reset", "herdr-ui");
  restorePermissions(f);
  assert.equal(code, 1);
  assert.match(err, /EACCES|permission denied/);
  assert.ok(fs.readFileSync(f.current).equals(before));
  assert.equal(deployedText(f, "mods/demo/main.js"), "// main\n");
});

/** The state directory cannot accept a file (not even a temporary one). */
async function readOnlyStateDir(f: Fixture): Promise<Record<string, string | undefined>> {
  fs.mkdirSync(f.state, { recursive: true });
  // The lock file exists already (the lock is an inode, not a file this run creates), and the
  // generation roots are writable, so the build runs; what cannot land is the state file's own
  // temporary, inside the read-only state directory.
  fs.writeFileSync(join(f.state, "lock"), "");
  fs.mkdirSync(join(f.state, "roots"), { recursive: true });
  fs.chmodSync(f.state, 0o555);
  return f.env;
}

function restorePermissions(f: Fixture): void {
  try {
    fs.chmodSync(f.state, 0o755);
  } catch {
    // The fixture cleans up with `force`, which is enough on a directory that exists.
  }
}

test("status lists the UI artifact, or its pin when nothing is published", async () => {
  const f = set();
  const pinned = await f.runCli("status");
  assert.match(pinned.out, new RegExp(`herdr-ui: baseline ${join(f.store, "baseline-herdr-ui")}`));
  assert.equal((await f.update("herdr-ui")).code, 0);
  const { code, out } = await f.runCli("status");
  assert.equal(code, 0);
  assert.match(out, /ui \(1\):/);
  assert.ok(out.includes(`herdr-ui: ${join(f.store, "out-ui-herdr-ui")}`));
  assert.match(out, /pinned 1111111/);
});

test("check is clean after an update and warns about a snapshot that left the store", async () => {
  const f = set();
  assert.equal((await f.update("herdr-ui")).code, 0);
  const clean = await f.runCli("check");
  assert.equal(clean.out, "");
  assert.equal(clean.err, "");
  fs.rmSync(join(f.store, "out-ui-herdr-ui"), { recursive: true, force: true });
  const { out } = await f.runCli("check");
  assert.match(out, /the herdr-ui UI artifact is gone from the store/);
  assert.match(out, /agents update herdr-ui/);
});

test("check warns when the baseline moved", async () => {
  const f = set();
  assert.equal((await f.update("herdr-ui")).code, 0);
  f.writeBaseline({ revision: NEXT_REVISION });
  const { out } = await f.runCli("check");
  assert.match(out, /herdr-ui was published from 1111111/);
});

test("resolve includes the UI paths after the keys that were there first", async () => {
  const f = set();
  const before = JSON.parse((await f.runCli("resolve")).out);
  assert.deepEqual(before.ui, { "herdr-ui": join(f.store, "baseline-herdr-ui") });
  assert.deepEqual(Object.keys(before), ["plugins", "skills", "ui"]);
  assert.equal((await f.update("herdr-ui")).code, 0);
  const after = JSON.parse((await f.runCli("resolve")).out);
  assert.deepEqual(after.ui, { "herdr-ui": join(f.store, "out-ui-herdr-ui") });
});

test("an app that is neither a plugin nor a UI artifact is refused", async () => {
  const f = set();
  const directory = join(f.checkout, "apps", "mystery");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: "mystery", version: "0.1.0" }),
  );
  commitAll(f.checkout, "mystery");
  const { code, err } = await f.update("mystery");
  assert.equal(code, 1);
  assert.match(err, /neither a claude nor a pi half/);
  assert.match(err, /"herdr": \{"ui": true\}/);
  assert.equal(fs.existsSync(f.current), false);
});

test("the UI metadata must say ui", async () => {
  const f = set();
  const directory = join(f.checkout, "apps", "mystery");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: "mystery", version: "0.1.0", herdr: {} }),
  );
  commitAll(f.checkout, "mystery");
  const { code, err } = await f.update("mystery");
  assert.equal(code, 1);
  assert.match(err, /neither a claude nor a pi half/);
});

test("a harness filter is refused for a UI artifact", async () => {
  const f = set();
  const { code, err } = await f.update("herdr-ui", "--harness", "pi");
  assert.equal(code, 1);
  assert.match(err, /no --harness halves/);
});

test("live says Herdr reloads its own files", async () => {
  const f = set();
  const { code, out } = await f.update("herdr-ui", "--live", "pi");
  assert.equal(code, 0);
  assert.match(out, /no reload request; Herdr watches the deployed files/);
  assert.equal(out.includes("live pi:"), false);
});

test("a UI artifact can be published alongside a plugin", async () => {
  const f = set();
  const { code, out, err } = await f.update("answer", "herdr-ui");
  assert.equal(code, 0, err);
  assert.match(out, /answer pi/);
  assert.match(out, /herdr-ui ui/);
  const raw = f.readState();
  assert.ok("answer" in raw.plugins);
  assert.ok("herdr-ui" in raw.ui);
});
