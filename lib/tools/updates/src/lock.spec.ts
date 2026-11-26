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
import {
  InterruptError,
  clearInterruptForTests,
  installInterruptHandler,
  throwIfInterrupted,
} from "./interrupt.ts";
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
  options: { detached?: boolean } = {},
): Promise<{
  child: ReturnType<typeof spawn>;
  closed: Promise<number | null>;
}> {
  const child = spawn(flockHelperForTests(), [path, timeout, "0.05"], {
    stdio: ["pipe", "pipe", "inherit"],
    env: env(),
    detached: options.detached ?? false,
  });
  child.stdin.on("error", () => undefined);
  const closed = new Promise<number | null>((resolve) => child.once("close", resolve));
  return new Promise((resolve) => {
    child.stdout.once("data", () => resolve({ child, closed }));
  });
}

async function releaseHolder(holder: {
  child: ReturnType<typeof spawn>;
  closed: Promise<unknown>;
}) {
  holder.child.stdin?.end();
  await holder.closed;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A child's process group: `detached: true` makes the child its own leader. */
const signalGroup = (pid: number | undefined, signal: NodeJS.Signals) => {
  if (pid !== undefined) process.kill(-pid, signal);
};

/** Processes whose command line names `path`: how a leaking helper would show itself. */
function processesMentioning(path: string): number[] {
  if (!fs.existsSync("/proc/self/cmdline")) return [];
  const found: number[] = [];
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let cmdline = "";
    try {
      cmdline = fs.readFileSync(`/proc/${entry}/cmdline`, "utf8");
    } catch {
      continue;
    }
    if (cmdline.includes(path)) found.push(Number(entry));
  }
  return found;
}

async function waitFor(predicate: () => boolean, timeout = 3000): Promise<void> {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (predicate()) return;
    await sleep(50);
  }
}

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
    // A refresh waits indefinitely for its profile through its own API; the CLI's variable is not
    // what bounds it.
    AGENTS_UPDATE_LOCK_TIMEOUT: "0.1",
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

// -- signals and lifecycles ---------------------------------------------------------------------

test("a held lock survives terminal signals and is released only by the pipe", async () => {
  const path = lockPath();
  // `detached` puts the helper in its own process group, the way a terminal delivers Ctrl+C to the
  // whole foreground group: both the Node process and this helper receive it.
  const holder = await spawnHolder(path, "-1", { detached: true });
  try {
    signalGroup(holder.child.pid, "SIGINT");
    signalGroup(holder.child.pid, "SIGTERM");
    await sleep(200);
    assert.equal(holder.child.exitCode, null, "the helper ignores the signal and keeps holding");
    await assert.rejects(
      acquireFileLock(path, { timeout: 0.2, env: env() }),
      LockBusyError,
      "the lock is still the interrupted holder's",
    );
  } finally {
    signalGroup(holder.child.pid, "SIGKILL");
    holder.child.stdin?.end();
    await holder.closed;
  }
  const release = await acquireFileLock(path, { timeout: 0.5, env: env() });
  await release();
});

test("a helper still waiting exits when its parent goes away", async () => {
  const path = lockPath();
  const holder = await spawnHolder(path);
  const waiter = spawn(flockHelperForTests(), [path, "-1", "0.05"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: env(),
  });
  waiter.stdin.on("error", () => undefined);
  let said = "";
  waiter.stdout.setEncoding("utf8");
  waiter.stdout.on("data", (chunk: string) => void (said += chunk));
  const closed = new Promise<number | null>((resolve) => waiter.once("close", resolve));
  try {
    await waitFor(() => said.includes("waiting"));
    assert.ok(said.includes("waiting"), "the helper said it is waiting");
    // The pipe closing is what a dead parent looks like; the wait must not poll until its timeout.
    const started = Date.now();
    waiter.stdin.end();
    const code = await closed;
    assert.equal(code, 76, "a cancelled wait exits with 76, not 75");
    assert.ok(Date.now() - started < 2000, "it noticed at once");
  } finally {
    await releaseHolder(holder);
  }
});

test("a Node process killed while waiting leaves no helper polling", async () => {
  const path = lockPath();
  const holder = await spawnHolder(path);
  const waiter = spawn(process.execPath, [HOLD, path], {
    stdio: ["ignore", "pipe", "pipe"],
    env: env(),
  });
  const closed = new Promise<number | null>((resolve) => waiter.once("close", resolve));
  try {
    // hold.ts acquires with a 10 s timeout, so it is still waiting for this lock.
    await sleep(600);
    assert.equal(waiter.exitCode, null, "the Node waiter is still waiting");
    waiter.kill("SIGKILL");
    await closed;
    // The helper's stdin was the dead process's pipe: it must exit on its own rather than poll.
    await waitFor(() => processesMentioning(path).every((pid) => pid === holder.child.pid), 3000);
    assert.deepEqual(
      processesMentioning(path).filter((pid) => pid !== holder.child.pid),
      [],
      "no helper is left polling for a parent that is gone",
    );
  } finally {
    await releaseHolder(holder);
  }
});

test("an interrupt does not release the lock before the protected work is done", async () => {
  installInterruptHandler();
  const path = lockPath();
  try {
    await assert.rejects(
      withFileLock(path, { timeout: 1, env: env() }, async () => {
        // `process.emit` is the spec's terminal: the handler runs exactly as a real SIGINT would.
        process.emit("SIGINT");
        // The protected work still owns the lock: a contender process times out instead of taking
        // it, so no cleanup can run beside another update.
        const contender = spawn(flockHelperForTests(), [path, "0.2", "0.05"], {
          stdio: ["pipe", "pipe", "inherit"],
          env: env(),
        });
        contender.stdin.on("error", () => undefined);
        const contenderClosed = new Promise<number | null>((resolve) =>
          contender.once("close", resolve),
        );
        assert.equal(
          await contenderClosed,
          75,
          "the interrupted holder still owns the lock while it cleans up",
        );
        throwIfInterrupted();
      }),
      InterruptError,
    );
    // The interrupted command is over; the next one starts with no pending signal and a free lock.
    clearInterruptForTests();
    const release = await acquireFileLock(path, { timeout: 0.2, env: env() });
    await release();
  } finally {
    clearInterruptForTests();
  }
});

test("SIGINT while waiting for the state lock exits 130 and leaves nothing behind", async () => {
  const f = await fixtureWithLock();
  const holder = await spawnHolder(join(f.state, "lock"));
  const child = spawn(process.execPath, [BIN, "update", "answer"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: cliEnv(f, { AGENTS_UPDATE_LOCK_TIMEOUT: "10" }),
    detached: true,
  });
  let err = "";
  child.stderr.on("data", (chunk) => void (err += chunk));
  const closed = new Promise<number | null>((resolve) => child.once("close", resolve));
  try {
    await waitFor(() => err.includes("waiting for another update to finish"));
    assert.match(err, /waiting for another update to finish/);
    // A terminal's Ctrl+C goes to the whole group: this Node process and its waiting helper.
    signalGroup(child.pid, "SIGINT");
    const code = await closed;
    assert.equal(code, 130, err);
    assert.match(err, /agents: interrupted/);
    assert.equal(err.includes("another agents update holds"), false);
    assert.equal(fs.existsSync(f.current), false, "nothing was published");
  } finally {
    await releaseHolder(holder);
  }
  try {
    // No cancelled waiter and no stale helper: a plain update now works.
    const later = await f.runCliWith(
      { ...f.env, AGENTS_UPDATE_LOCK_TIMEOUT: "1" },
      "update",
      "answer",
    );
    assert.equal(later.code, 0, later.err);
  } finally {
    f.cleanup();
  }
});

test("SIGINT during a build cleans up and keeps the previous publication", async () => {
  const f = await fixtureWithLock();
  const first = await f.runCliWith(f.env, "update", "answer");
  assert.equal(first.code, 0, first.err);
  const before = fs.readFileSync(f.current);
  const marker = join(f.temporary, "nix-started");
  const child = spawn(process.execPath, [BIN, "update", "answer"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: cliEnv(f, { FAKE_NIX_SLEEP: "5", FAKE_NIX_MARKER: marker }),
    detached: true,
  });
  let err = "";
  child.stderr.on("data", (chunk) => void (err += chunk));
  const closed = new Promise<number | null>((resolve) => child.once("close", resolve));
  try {
    // The fake build touches the marker when it starts, so the signal lands inside the build.
    await waitFor(() => fs.existsSync(marker));
    assert.ok(fs.existsSync(marker), "the build has started");
    signalGroup(child.pid, "SIGINT");
    const code = await closed;
    assert.equal(code, 130, err);
    assert.match(err, /agents: interrupted/);
    assert.equal(err.includes("snapshot build failed"), false);
    assert.deepEqual(fs.readFileSync(f.current), before, "the previous publication is untouched");
    await waitFor(
      () => !fs.readdirSync(f.snapshots).some((name) => name.startsWith("agents-update-")),
    );
    assert.deepEqual(
      fs.readdirSync(f.snapshots).filter((name) => name.startsWith("agents-update-")),
      [],
      "the temporary snapshot is removed, as Python's KeyboardInterrupt removed it",
    );
  } finally {
    f.cleanup();
  }
});

test("a negative lock timeout fails at once, as Python's deadline did", async () => {
  const f = await fixtureWithLock();
  const holder = await spawnHolder(join(f.state, "lock"));
  try {
    const started = Date.now();
    const result = await f.runCliWith(
      { ...f.env, AGENTS_UPDATE_LOCK_TIMEOUT: "-1" },
      "update",
      "answer",
    );
    assert.equal(result.code, 1);
    assert.match(result.err, /waiting for another update to finish/);
    assert.match(result.err, /another agents update holds/);
    assert.ok(Date.now() - started < 2000, "it did not wait");
    assert.equal(fs.existsSync(f.current), false);
  } finally {
    await releaseHolder(holder);
    f.cleanup();
  }
});
