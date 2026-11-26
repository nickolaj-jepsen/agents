/**
 * `agents update` and `agents reset`, against a fake nix and a real (small) git checkout: what gets
 * built, what the state records, and what a failure or a concurrent update leaves alone.
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

test("an update builds both halves and commits the state", async () => {
  const f = set();
  const { code, out, err } = await f.update("answer");
  assert.equal(code, 0, err);
  const raw = f.readState();
  assert.equal(raw.plugins.answer.pi, join(f.store, "out-answer-pi"));
  assert.equal(raw.plugins.answer.claude, join(f.store, "out-answer-claude"));
  assert.equal(raw.plugins.answer.baseline, REVISION);
  assert.match(out, /published answer pi, answer claude/);
  const roots = fs.readdirSync(join(f.state, "roots"));
  assert.equal(roots.length, 1);
  const root = join(f.state, "roots", roots[0]!);
  assert.ok(fs.lstatSync(join(root, "build")).isSymbolicLink());
  assert.ok(fs.readlinkSync(join(root, "build")).startsWith(join(f.store, "farm")));
});

test("the expression wires mkClaudePlugin to the supplied claude package", async () => {
  const f = set();
  await f.update("answer");
  const expression = f.expr();
  assert.match(
    expression,
    new RegExp(`builtins\\.storePath ${escapeRegExp(join(f.store, "claude-code-2.0"))}`),
  );
  assert.ok(
    expression.includes("mkClaude = flake.lib.mkClaudePlugin { inherit pkgs claude-code; }"),
  );
  assert.ok(expression.includes('mkClaude "answer"'));
  assert.ok(expression.includes('plugins."answer".path'));
  assert.ok(expression.includes('builtins.getFlake "path:'));
  assert.ok(expression.includes(`import ${join(f.store, "nixpkgs-source")}`));
  assert.ok(expression.includes('name = "plugins/answer/pi"'));
  assert.equal(expression.includes("builtins.path {"), false);
});

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("--harness builds only that half and leaves the other to the baseline", async () => {
  const f = set();
  const { code, err } = await f.update("answer", "--harness", "pi");
  assert.equal(code, 0, err);
  const raw = f.readState();
  assert.equal(raw.plugins.answer.pi, join(f.store, "out-answer-pi"));
  assert.equal(raw.plugins.answer.claude, null);
  const expression = f.expr();
  assert.equal(expression.includes("mkClaude"), false);
  assert.equal(expression.includes("claude-code"), false);
});

test("a skill update snapshots the whole tree", async () => {
  const f = set();
  const { code, out, err } = await f.update("demo", "--skill");
  assert.equal(code, 0, err);
  const raw = f.readState();
  assert.equal(raw.skills.demo.path, join(f.store, "snapshot", "skills", "demo"));
  assert.equal(raw.skills.demo.baseline, REVISION);
  assert.ok(f.expr().includes('name = "skills"'));
  assert.ok(f.expr().includes("builtins.path { path ="));
  assert.ok(out.includes(`demo skill: ${join(f.store, "snapshot", "skills", "demo")}`));
});

test("a new plugin name is allowed and resolves", async () => {
  const f = set();
  const directory = join(f.checkout, "apps", "brand-new");
  fs.mkdirSync(join(directory, "src"), { recursive: true });
  fs.writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: "@nickolaj-jepsen/brand-new", version: "0.1.0", pi: {} }),
  );
  commitAll(f.checkout, "new");
  const update = await f.update("brand-new");
  assert.equal(update.code, 0, update.err);
  const resolved = await f.runCli("resolve");
  assert.equal(resolved.code, 0, resolved.err);
  assert.deepEqual(JSON.parse(resolved.out).plugins["brand-new"], {
    pi: join(f.store, "out-brand-new-pi"),
    claude: null,
  });
});

test("a half the checkout no longer offers inherits the baseline", async () => {
  const f = set();
  f.writeBaseline({
    plugins: {
      docfix: {
        pi: join(f.store, "baseline-docfix-pi"),
        claude: join(f.store, "baseline-docfix-claude"),
      },
    },
  });
  const { code, err } = await f.update("docfix");
  assert.equal(code, 0, err);
  assert.equal(f.readState().plugins.docfix.claude, null);
  const resolved = await f.runCli("resolve");
  assert.equal(
    JSON.parse(resolved.out).plugins.docfix.claude,
    join(f.store, "baseline-docfix-claude"),
  );
});

test("an unknown name fails without writing state", async () => {
  const f = set();
  const { code, out, err } = await f.update("nope");
  assert.equal(code, 1);
  assert.match(err, /not a plugin in the checkout/);
  assert.equal(fs.existsSync(f.current), false);
  assert.equal(out, "");
});

test("an explicitly unsupported harness fails", async () => {
  const f = set();
  const { code, err } = await f.update("docfix", "--harness", "claude");
  assert.equal(code, 1);
  assert.match(err, /no claude half/);
  assert.equal(fs.existsSync(f.current), false);
});

test("a bad name fails before touching anything", async () => {
  const f = set();
  const { code, err } = await f.update("../answer");
  assert.equal(code, 1);
  assert.match(err, /bad name/);
  assert.equal(fs.existsSync(f.state), false);
});

test("a failed build preserves the previous state and keeps the snapshot", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  const before = fs.readFileSync(f.current, "utf8");
  const failing = { ...f.env, FAKE_NIX_FAIL: "1" };
  const { code, err } = await f.runCliWith(failing, "update", "answer");
  assert.equal(code, 1);
  assert.match(err, /the snapshot build failed; the state in current\.json is unchanged/);
  assert.match(err, /fake nix: the build failed/);
  assert.equal(fs.readFileSync(f.current, "utf8"), before);
  // The published tree is kept for inspection, with its path reported.
  assert.match(err, /kept the published snapshot in/);
  // The failed generation has its directory but no root link: nothing was published.
  const roots = fs.readdirSync(join(f.state, "roots"));
  assert.equal(
    roots.filter((root) => fs.existsSync(join(f.state, "roots", root, "build"))).length,
    1,
  );
  assert.equal(roots.length, 2);
});

test("a failed first build writes no state at all", async () => {
  const f = set();
  const failing = { ...f.env, FAKE_NIX_FAIL: "1" };
  const { code } = await f.runCliWith(failing, "update", "answer");
  assert.equal(code, 1);
  assert.equal(fs.existsSync(f.current), false);
});

test("a dry run builds nothing and writes nothing", async () => {
  const f = set();
  const { code, out, err } = await f.update("answer", "--dry-run");
  assert.equal(code, 0, err);
  assert.match(out, /dry run: answer pi, answer claude from/);
  assert.match(out, /\(6 files, clean\)/);
  assert.match(out, /dry run: nothing built, state unchanged/);
  assert.equal(fs.existsSync(f.exprLog), false);
  assert.equal(fs.existsSync(f.current), false);
});

test("a filtered update keeps the other half's drift visible", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  f.writeBaseline({ revision: NEXT_REVISION });
  assert.equal((await f.update("answer", "--harness", "pi")).code, 0);
  // The claude half is still the old snapshot, so the entry must still say so.
  assert.equal(f.readState().plugins.answer.baseline, REVISION);
  const check = await f.runCli("check");
  assert.equal(check.code, 0);
  assert.match(check.out, /answer was published from 1111111/);
  assert.match(check.out, /the pinned baseline is 2222222/);
  // A full update restamps the entry and the warning clears.
  assert.equal((await f.update("answer")).code, 0);
  assert.equal(f.readState().plugins.answer.baseline, NEXT_REVISION);
  assert.equal((await f.runCli("check")).out, "");
});

test("a filtered update of an inheriting entry still restamps", async () => {
  // The other half only inherits the baseline, so there is no stale override to hide.
  const f = set();
  assert.equal((await f.update("answer", "--harness", "pi")).code, 0);
  f.writeBaseline({ revision: NEXT_REVISION });
  assert.equal((await f.update("answer", "--harness", "pi")).code, 0);
  assert.equal(f.readState().plugins.answer.baseline, NEXT_REVISION);
  assert.equal((await f.runCli("check")).out, "");
});

test("a filtered update never drops the other half", async () => {
  // An earlier publication recorded a claude half for docfix; the checkout no longer offers one.
  // Filtering to pi must leave that override in place, not null it out.
  const f = set();
  fs.mkdirSync(f.state, { recursive: true });
  fs.writeFileSync(
    f.current,
    JSON.stringify({
      plugins: {
        docfix: { pi: null, claude: join(f.store, "old-docfix-claude"), baseline: REVISION },
      },
      skills: {},
    }),
  );
  assert.equal((await f.update("docfix", "--harness", "pi")).code, 0);
  const raw = f.readState();
  assert.equal(raw.plugins.docfix.pi, join(f.store, "out-docfix-pi"));
  assert.equal(raw.plugins.docfix.claude, join(f.store, "old-docfix-claude"));
  assert.equal(raw.plugins.docfix.baseline, REVISION);
});

test("an unfiltered update drops a half the checkout no longer offers", async () => {
  const f = set();
  fs.mkdirSync(f.state, { recursive: true });
  fs.writeFileSync(
    f.current,
    JSON.stringify({
      plugins: {
        docfix: { pi: null, claude: join(f.store, "old-docfix-claude"), baseline: REVISION },
      },
      skills: {},
    }),
  );
  assert.equal((await f.update("docfix")).code, 0);
  const raw = f.readState();
  assert.equal(raw.plugins.docfix.pi, join(f.store, "out-docfix-pi"));
  assert.equal(raw.plugins.docfix.claude, null);
});

test("a skill update keeps plugin snapshots", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  assert.equal((await f.update("demo", "--skill")).code, 0);
  const raw = f.readState();
  assert.ok("answer" in raw.plugins);
  assert.ok("demo" in raw.skills);
});

test("--harness with --skill is refused", async () => {
  const f = set();
  const { code, err } = await f.update("demo", "--skill", "--harness", "pi");
  assert.equal(code, 1);
  assert.match(err, /skills have none/);
});

test("concurrent updates are locked out", async () => {
  const f = set();
  fs.mkdirSync(f.state, { recursive: true });
  const { spawn } = await import("node:child_process");
  const holder = spawn(f.env.AGENTS_FLOCK!, [join(f.state, "lock"), "-1", "0.05"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  holder.stdin.on("error", () => undefined);
  await new Promise<void>((resolve) => holder.stdout.once("data", () => resolve()));
  try {
    const env = { ...f.env, AGENTS_UPDATE_LOCK_TIMEOUT: "0.2" };
    const { code, err } = await f.runCliWith(env, "update", "answer");
    assert.equal(code, 1);
    assert.match(err, /another agents update holds/);
    assert.equal(fs.existsSync(f.current), false);
  } finally {
    holder.stdin.end();
    await new Promise((resolve) => holder.once("close", resolve));
  }
});

test("AGENTS_UPDATE_KEEP_SNAPSHOT keeps the published snapshot", async () => {
  const f = set();
  const { code, err } = await f.runCliWith(
    { ...f.env, AGENTS_UPDATE_KEEP_SNAPSHOT: "1" },
    "update",
    "answer",
  );
  assert.equal(code, 0, err);
  const kept = /kept the published snapshot in (\S+)/.exec(err)?.[1];
  assert.ok(kept, err);
  assert.ok(fs.existsSync(join(kept, "agents-snapshot", "apps", "answer", "package.json")));
});

test("a lock timeout that is not a number is refused", async () => {
  const f = set();
  const { code, err } = await f.runCliWith(
    { ...f.env, AGENTS_UPDATE_LOCK_TIMEOUT: "soon" },
    "update",
    "answer",
  );
  assert.equal(code, 1);
  assert.match(err, /AGENTS_UPDATE_LOCK_TIMEOUT is not a number/);
  assert.equal(fs.existsSync(f.state), false);
});

test("an update is idempotent and keeps every root", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  const first = JSON.parse(fs.readFileSync(f.current, "utf8"));
  const second = await f.update("answer");
  assert.equal(second.code, 0, second.err);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.current, "utf8")), first);
  // Roots are never pruned: a running session may still load an older snapshot.
  const roots = fs.readdirSync(join(f.state, "roots")).sort();
  assert.equal(roots.length, 2);
  for (const root of roots) {
    assert.ok(fs.lstatSync(join(f.state, "roots", root, "build")).isSymbolicLink());
  }
  assert.match(second.out, /older roots stay for running sessions/);
});

test("reset on a fresh installation creates its lock directory and is a no-op", async () => {
  const f = set();
  for (const flags of [[], ["--skill"]]) {
    fs.rmSync(f.stateHome, { recursive: true, force: true });
    const { code, out, err } = await f.runCli("reset", "answer", ...flags);
    assert.equal(code, 0, err);
    assert.match(out, /nothing to reset/);
    assert.equal(fs.existsSync(f.current), false);
  }
});

test("reset does not treat inherited properties as published names", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  const before = fs.readFileSync(f.current, "utf8");
  for (const flags of [[], ["--skill"], ["--harness", "pi"]]) {
    const { code, out, err } = await f.runCli("reset", "constructor", ...flags);
    assert.equal(code, 0, err);
    assert.match(out, /nothing to reset/);
    assert.equal(fs.readFileSync(f.current, "utf8"), before);
  }
});

test("reset one harness keeps the other", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  const { code, out, err } = await f.runCli("reset", "answer", "--harness", "pi");
  assert.equal(code, 0, err);
  const raw = f.readState();
  assert.equal(raw.plugins.answer.pi, null);
  assert.equal(raw.plugins.answer.claude, join(f.store, "out-answer-claude"));
  assert.match(out, /answer \(pi\)/);
});

test("reset removes the whole entry", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  assert.equal((await f.runCli("reset", "answer")).code, 0);
  assert.equal("answer" in f.readState().plugins, false);
});

test("reset removes a skill", async () => {
  const f = set();
  assert.equal((await f.update("demo", "--skill")).code, 0);
  assert.equal((await f.runCli("reset", "demo", "--skill")).code, 0);
  assert.equal("demo" in f.readState().skills, false);
});

test("reset of an unknown name is a no-op", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  const before = fs.readFileSync(f.current, "utf8");
  const { code, out, err } = await f.runCli("reset", "nope");
  assert.equal(code, 0, err);
  assert.match(out, /nothing to reset/);
  assert.equal(fs.readFileSync(f.current, "utf8"), before);
});

test("after a reset the resolution is the baseline again", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  assert.equal((await f.runCli("reset", "answer")).code, 0);
  const { code, out } = await f.runCli("resolve");
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(out).plugins.answer, {
    pi: join(f.store, "baseline-answer-pi"),
    claude: join(f.store, "baseline-answer-claude"),
  });
});
