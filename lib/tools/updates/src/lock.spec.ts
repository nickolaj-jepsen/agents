/**
 * The kernel lock both programs rely on: exclusion across processes, the timeout, and release when
 * a holder dies — including a Node process killed while it holds the lock.
 *
 * `withFileLock` runs a helper that holds flock(2) on the file and exits when its stdin closes, so
 * process death is a release. These specs drive real processes against the real helper.
 */
import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { LockBusyError, acquireFileLock, withFileLock } from "./lock.ts";
import { flockHelperForTests } from "./test/flock.ts";

const HOLD = fileURLToPath(new URL("test/hold.ts", import.meta.url));
const BIN = fileURLToPath(new URL("bin.ts", import.meta.url));

const scratch: string[] = [];
afterEach(() => {
  for (const directory of scratch.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function lockPath(): string {
  const directory = fs.mkdtempSync(join(os.tmpdir(), "agents-lock-test-"));
  scratch.push(directory);
  return join(directory, "lock");
}

const env = () => ({ ...process.env, AGENTS_FLOCK: flockHelperForTests() });

function spawnHolder(
  path: string,
  timeout = "-1",
): Promise<{
  child: ReturnType<typeof spawn>;
  closed: Promise<void>;
}> {
  const child = spawn(flockHelperForTests(), [path, timeout, "0.05"], {
    stdio: ["pipe", "pipe", "inherit"],
    env: env(),
  });
  child.stdin.on("error", () => undefined);
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  return new Promise((resolve) => {
    child.stdout.once("data", () => resolve({ child, closed }));
  });
}

async function releaseHolder(holder: { child: ReturnType<typeof spawn>; closed: Promise<void> }) {
  holder.child.stdin?.end();
  await holder.closed;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("an exclusive lock excludes a second holder and comes back when released", async () => {
  const path = lockPath();
  const release = await acquireFileLock(path, { timeout: 1, env: env() });
  try {
    await assert.rejects(
      acquireFileLock(path, { timeout: 0.2, env: env() }),
      (error: unknown) =>
        error instanceof LockBusyError && /another agents update holds/.test(error.message),
    );
  } finally {
    await release();
  }
  const again = await acquireFileLock(path, { timeout: 0.2, env: env() });
  await again();
});

test("the wait reports itself once, then the lock arrives", async () => {
  const path = lockPath();
  const holder = await spawnHolder(path);
  try {
    const waits: string[] = [];
    const pending = acquireFileLock(path, {
      timeout: 5,
      env: env(),
      onWait: (busy) => waits.push(busy),
    });
    await sleep(300);
    assert.deepEqual(waits, [path], "the wait is announced once, before the lock is ours");
    await releaseHolder(holder);
    const release = await pending;
    await release();
    assert.deepEqual(waits, [path]);
  } finally {
    await releaseHolder(holder);
  }
});

test("a dead holder releases the lock", async () => {
  const path = lockPath();
  const holder = await spawnHolder(path);
  holder.child.kill("SIGKILL");
  await holder.closed;
  const release = await acquireFileLock(path, { timeout: 0.5, env: env() });
  await release();
});

test("a killed Node process releases the lock it held", async () => {
  const path = lockPath();
  const child = spawn(process.execPath, [HOLD, path], {
    stdio: ["ignore", "pipe", "inherit"],
    env: env(),
  });
  await new Promise<void>((resolve, reject) => {
    child.stdout.once("data", () => resolve());
    child.once("error", reject);
  });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  assert.ok(fs.existsSync(path), "the lock file exists while it is held");
  child.kill("SIGKILL");
  await closed;
  // The helper's stdin was the pipe from the dead process: it exits and the kernel takes the lock
  // back without waiting for the CLI's timeout.
  const release = await acquireFileLock(path, { timeout: 1, env: env() });
  await release();
});

test("withFileLock releases the lock when the work throws", async () => {
  const path = lockPath();
  await assert.rejects(
    withFileLock(path, { timeout: 1, env: env() }, () => {
      throw new Error("work failed");
    }),
    /work failed/,
  );
  const release = await acquireFileLock(path, { timeout: 0.2, env: env() });
  await release();
});

/** The CLI's state lock, looked at through the processes that contend for it. */
async function fixtureWithLock() {
  const { Fixture } = await import("./test/fixture.ts");
  const f = new Fixture();
  fs.mkdirSync(f.state, { recursive: true });
  return f;
}

function cliEnv(f: { env: Record<string, string | undefined> }, extra: Record<string, string>) {
  const merged: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries({ ...f.env, ...extra })) {
    if (typeof value === "string") merged[key] = value;
  }
  return merged;
}

test("an update waits for the state lock and then publishes", async () => {
  const f = await fixtureWithLock();
  const holder = await spawnHolder(join(f.state, "lock"));
  const child = spawn(process.execPath, [BIN, "update", "answer"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: cliEnv(f, { AGENTS_UPDATE_LOCK_TIMEOUT: "10" }),
  });
  let out = "";
  let err = "";
  child.stdout.on("data", (chunk) => void (out += chunk));
  child.stderr.on("data", (chunk) => void (err += chunk));
  const closed = new Promise<number | null>((resolve) => child.once("close", resolve));
  try {
    await sleep(400);
    assert.equal(
      fs.existsSync(f.current),
      false,
      "nothing is published while another update holds it",
    );
    await releaseHolder(holder);
    const code = await closed;
    assert.equal(code, 0, err);
    assert.match(err, /waiting for another update to finish/);
    assert.match(out, /published answer pi, answer claude/);
    assert.ok(fs.existsSync(f.current));
  } finally {
    f.cleanup();
  }
});

test("an update gives up after AGENTS_UPDATE_LOCK_TIMEOUT and leaves the state alone", async () => {
  const f = await fixtureWithLock();
  const holder = await spawnHolder(join(f.state, "lock"));
  try {
    const result = await f.runCliWith(
      { ...f.env, AGENTS_UPDATE_LOCK_TIMEOUT: "0.2" },
      "update",
      "answer",
    );
    assert.equal(result.code, 1);
    assert.match(result.err, /another agents update holds/);
    assert.equal(fs.existsSync(f.current), false);
    assert.equal(fs.existsSync(f.exprLog), false, "no build was started");
  } finally {
    await releaseHolder(holder);
    f.cleanup();
  }
});

test("an update and a refresh running together leave both files whole", async () => {
  const f = await fixtureWithLock();
  const profile = join(f.temporary, "profile");
  fs.mkdirSync(profile, { recursive: true });
  const refresh = fileURLToPath(new URL("refresh-bin.ts", import.meta.url));
  const stub = join(f.temporary, "agents");
  fs.writeFileSync(stub, "#!/bin/sh\nprintf '%s' '{\"plugins\":{},\"skills\":{}}'\n", {
    mode: 0o755,
  });
  const settingsPath = join(profile, "settings.json");
  fs.writeFileSync(settingsPath, JSON.stringify({ packages: ["user-package"], model: "keep-me" }));

  // The update holds the state lock across a slow build; the refreshers read `current.json` while
  // it is being published. Each must end whole: an atomic rename, not a half-written file.
  const updating = spawn(process.execPath, [BIN, "update", "answer"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: cliEnv(f, { FAKE_NIX_SLEEP: "0.6" }),
  });
  const updateClosed = new Promise<number | null>((resolve) => updating.once("close", resolve));
  const refreshing = [0, 1].map(
    () =>
      new Promise<number | null>((resolve) => {
        const child = spawn(process.execPath, [refresh], {
          stdio: ["ignore", "pipe", "pipe"],
          env: cliEnv(f, { AGENTS_HARNESS: "pi", AGENTS_PROFILE: profile, AGENTS_CLI: stub }),
        });
        child.once("close", resolve);
      }),
  );
  try {
    assert.deepEqual(await Promise.all(refreshing), [0, 0]);
    assert.equal(await updateClosed, 0);
    JSON.parse(fs.readFileSync(f.current, "utf8"));
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.equal(settings.model, "keep-me");
    assert.ok(settings.packages.includes("user-package"));
    JSON.parse(fs.readFileSync(join(profile, ".agents-updates.json"), "utf8"));
  } finally {
    f.cleanup();
  }
});

test("a refresh waits for the profile lock, and two refreshes do not overlap", async () => {
  const { Fixture } = await import("./test/fixture.ts");
  const f = new Fixture();
  const profile = join(f.temporary, "profile");
  fs.mkdirSync(profile, { recursive: true });
  const refresh = fileURLToPath(new URL("refresh-bin.ts", import.meta.url));
  const stub = join(f.temporary, "agents");
  fs.writeFileSync(
    stub,
    `#!/bin/sh\nprintf '%s' '{"plugins":{"answer":{"pi":"/nix/store/answer-pi","claude":null}},"skills":{"demo":"/nix/store/demo"}}'\n`,
    { mode: 0o755 },
  );
  const refreshEnv = cliEnv(f, {
    AGENTS_HARNESS: "pi",
    AGENTS_PROFILE: profile,
    AGENTS_CLI: stub,
  });
  fs.writeFileSync(
    join(profile, "settings.json"),
    JSON.stringify({ packages: ["/nix/store/answer-pin", "user-package"], model: "keep-me" }),
  );
  const settingsPath = join(profile, "settings.json");

  const holder = await spawnHolder(join(profile, ".agents-updates.lock"));
  const first = spawn(process.execPath, [refresh], {
    stdio: ["ignore", "pipe", "pipe"],
    env: refreshEnv,
  });
  let firstErr = "";
  first.stderr.on("data", (chunk) => void (firstErr += chunk));
  const firstClosed = new Promise<number | null>((resolve) => first.once("close", resolve));
  try {
    await sleep(400);
    const blocked = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.deepEqual(
      blocked.packages,
      ["/nix/store/answer-pin", "user-package"],
      "the profile is untouched while its lock is held",
    );
    await releaseHolder(holder);
    assert.equal(await firstClosed, 0, firstErr);

    // Two at once: each rewrites the managed entries under the lock, and the file stays whole.
    const running = [0, 1].map(
      () =>
        new Promise<number | null>((resolve) => {
          const child = spawn(process.execPath, [refresh], {
            stdio: ["ignore", "pipe", "pipe"],
            env: refreshEnv,
          });
          child.once("close", resolve);
        }),
    );
    assert.deepEqual(await Promise.all(running), [0, 0]);
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.ok(settings.packages.includes("/nix/store/answer-pi"));
    assert.ok(settings.packages.includes("user-package"));
    assert.equal(settings.model, "keep-me");
    JSON.parse(fs.readFileSync(join(profile, ".agents-updates.json"), "utf8"));
  } finally {
    await releaseHolder(holder);
    f.cleanup();
  }
});
