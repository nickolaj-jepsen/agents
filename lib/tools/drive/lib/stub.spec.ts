/**
 * A stub with an owner is what ends a test run that was killed before its cleanup: VS Code runs
 * detached, so nothing else would. The owner and the run's other process are real ones here; the
 * other ignores SIGTERM, as VS Code's main process can.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { alive } from "./procs.ts";
import { startStub, stopStub } from "./stub.ts";

const dir = mkdtempSync(join(tmpdir(), "drive-stub-"));
const started: ChildProcess[] = [];
afterAll(() => {
  for (const child of started) child.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
});

/** A process that names `runDir` on its command line and outlives a SIGTERM. */
function stubborn(runDir: string) {
  const child = spawn("sh", ["-c", 'trap "" TERM; while :; do sleep 1; done', runDir], {
    detached: true,
    stdio: "ignore",
  });
  started.push(child);
  return child.pid!;
}

function sleeper() {
  const child = spawn("sleep", ["600"], { stdio: "ignore" });
  started.push(child);
  return child;
}

async function until(done: () => boolean, ms: number) {
  for (const end = Date.now() + ms; Date.now() < end;)
    if (done()) return true;
    else await new Promise((r) => setTimeout(r, 100));
  return done();
}

const stubPid = (runDir: string) => Number(readFileSync(join(runDir, "stub.pid"), "utf8"));

describe.skipIf(!existsSync("/proc"))("a stub's owner", () => {
  it("takes the run with it when it dies, a process that ignores SIGTERM included", async () => {
    const runDir = mkdtempSync(join(dir, "run-"));
    const other = stubborn(runDir);
    const owner = sleeper();
    await startStub(runDir, [], { pid: owner.pid!, endsRun: true });
    const stub = stubPid(runDir);
    owner.kill("SIGKILL");
    expect(await until(() => !alive(other) && !alive(stub), 10_000)).toBe(true);
  });

  it("leaves the run alone without endsRun, and while the owner lives", async () => {
    const runDir = mkdtempSync(join(dir, "run-"));
    const other = stubborn(runDir);
    const owner = sleeper();
    await startStub(runDir, [], { pid: owner.pid! });
    const stub = stubPid(runDir);
    // Two of the stub's polls with the owner alive: nothing is ended.
    await new Promise((r) => setTimeout(r, 4500));
    expect(alive(stub) && alive(other)).toBe(true);
    owner.kill("SIGKILL");
    expect(await until(() => !alive(stub), 10_000)).toBe(true);
    expect(alive(other)).toBe(true);
    process.kill(other, "SIGKILL");
  });

  it("is not stopped by a restart: stopStub ends the stub alone", async () => {
    const runDir = mkdtempSync(join(dir, "run-"));
    const other = stubborn(runDir);
    const owner = sleeper();
    await startStub(runDir, [], { pid: owner.pid!, endsRun: true });
    const stub = stubPid(runDir);
    stopStub(runDir);
    expect(await until(() => !alive(stub), 5000)).toBe(true);
    expect(alive(other)).toBe(true);
    process.kill(other, "SIGKILL");
  });
});
