/** The installed entry points, run as processes: exit codes, streams, and the state on disk. */
import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Fixture } from "./test/fixture.ts";

const BIN = fileURLToPath(new URL("bin.ts", import.meta.url));

let fixture: Fixture | undefined;
afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});

const set = (): Fixture => (fixture = new Fixture());

function run(f: Fixture, argv: string[], env: Record<string, string | undefined> = f.env) {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(env))
    if (typeof value === "string") childEnv[key] = value;
  const result = spawnSync(process.execPath, [BIN, ...argv], {
    env: childEnv,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

test("the entry point runs end to end", () => {
  const f = set();
  const resolve = run(f, ["resolve"]);
  assert.equal(resolve.code, 0, resolve.err);
  assert.equal(JSON.parse(resolve.out).plugins.answer.pi, join(f.store, "baseline-answer-pi"));

  for (const argv of [["update", "answer"], ["check"], ["status"]]) {
    const result = run(f, argv);
    assert.equal(result.code, 0, result.err);
  }
  assert.equal(
    JSON.parse(fs.readFileSync(f.current, "utf8")).plugins.answer.pi,
    join(f.store, "out-answer-pi"),
  );

  const reset = run(f, ["reset", "answer"]);
  assert.equal(reset.code, 0, reset.err);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.current, "utf8")).plugins, {});
});

test("a consumer that stops reading gets no stack trace", async () => {
  const f = set();
  // Enough output that the pipe is still being written when the reader goes away (`` | head``).
  fs.mkdirSync(f.state, { recursive: true });
  const plugins: Record<string, unknown> = {};
  for (let index = 0; index < 3000; index += 1) {
    plugins[`plugin-${index}`] = { pi: "/nix/store/x", claude: null, baseline: "1".repeat(40) };
  }
  fs.writeFileSync(f.current, JSON.stringify({ plugins, skills: {} }));
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(f.env))
    if (typeof value === "string") childEnv[key] = value;
  const child = spawn(process.execPath, [BIN, "status"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: childEnv,
  });
  let err = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => void (err += chunk));
  const closed = new Promise<number | null>((resolve) => child.once("close", resolve));
  await new Promise<void>((resolve) => {
    child.stdout.once("data", () => {
      child.stdout.destroy();
      resolve();
    });
  });
  assert.equal(await closed, 0, err);
  assert.equal(err.includes("EPIPE"), false, err);
});

test("usage errors exit two and name the command", () => {
  const result = spawnSync(process.execPath, [BIN], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /COMMAND/);
});

// The one thing a fake nix cannot show: that this expression really derives a Claude half.
// `AGENTS_UPDATE_REAL_NIX=1` with the wrapper's AGENTS_* variables evaluates it.
test.skipIf(process.env.AGENTS_UPDATE_REAL_NIX !== "1")(
  "the claude half derives from the snapshot with the real nix",
  async () => {
    const { buildExpression, contextFromEnv, pluginHalves } = await import("./nix.ts");
    const { publishSnapshot } = await import("./snapshot.ts");
    const { stateDir } = await import("./core/paths.ts");
    const { execFileSync } = await import("node:child_process");
    const context = contextFromEnv(process.env, stateDir(process.env));
    const temporary = fs.mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "agents-real-nix-"));
    try {
      const snapshot = publishSnapshot(
        context.checkout,
        join(temporary, "agents-snapshot"),
        context.environment,
      );
      const names = fs
        .readdirSync(join(snapshot.root, "apps"))
        .filter((name) => fs.existsSync(join(snapshot.root, "apps", name, "package.json")))
        .sort();
      const withClaude = names.filter((name) =>
        (pluginHalves(snapshot.root, name) ?? []).includes("claude"),
      );
      assert.ok(withClaude.length > 0, "the checkout has no plugin with a claude half");
      const expression = buildExpression(
        context,
        snapshot.root,
        [{ name: withClaude[0]!, variant: "claude" }],
        [],
      );
      const stdout = execFileSync(
        "nix",
        ["eval", "--impure", "--raw", "--expr", `(${expression}).drvPath`],
        { env: context.environment, encoding: "utf8" },
      );
      assert.ok(stdout.startsWith(`${context.nixpkgs.replace(/\/[^/]+$/, "")}/`), stdout);
      assert.ok(stdout.endsWith(".drv"), stdout);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  },
);
