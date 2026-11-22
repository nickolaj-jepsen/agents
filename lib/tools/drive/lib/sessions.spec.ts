/**
 * A parked session's record is what the next `drive` invocation attaches to. It is published whole:
 * a reader sees the record from before the write or the one after it, never half of either, and a
 * write that fails leaves the record that was there.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as Sessions from "./sessions.ts";
import type { SessionRecord } from "./sessions.ts";

const dir = mkdtempSync(join(tmpdir(), "drive-sessions-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The registry is `${XDG_STATE_HOME}/agent-tools-e2e`, read when the module loads: this spec's own. */
let s: typeof Sessions;
let sessionsDir: string;
beforeAll(async () => {
  process.env.XDG_STATE_HOME = dir;
  s = await import("./sessions.ts");
  sessionsDir = join(dir, "agent-tools-e2e", "sessions", s.checkoutId);
});

const parked = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  harness: "pi",
  package: "answer",
  scenario: "cards-open",
  file: "/repo/apps/answer/src/e2e/pi.scenarios.ts",
  runDir: "/tmp/run-default",
  daemon: "d-1a2b3c4d-default",
  size: [80, 24],
  ...over,
});

describe("a record", () => {
  it("is published whole, never half written", async () => {
    const reader = join(dir, "reader.mjs");
    const stop = join(dir, "stop");
    writeFileSync(
      reader,
      `import { readFileSync } from "node:fs";
const [file, stop] = process.argv.slice(2);
let reads = 0, broken = 0;
for (;;) {
  try {
    reads++;
    JSON.parse(readFileSync(file, "utf8"));
  } catch {
    broken++;
  }
  if (reads % 20 === 0) {
    try {
      if (readFileSync(stop, "utf8") === "stop") break;
    } catch {}
  }
}
console.log(JSON.stringify({ reads, broken }));
`,
    );
    s.writeSession("default", parked());
    const child = spawn(process.execPath, [reader, s.sessionFile("default"), stop], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    const printed = new Promise<string>((resolve) =>
      child.stdout.on("data", (chunk) => resolve(String(chunk))),
    );
    try {
      // Large enough that a write in place would be caught mid-file.
      const blob = "x".repeat(1 << 20);
      for (let i = 0; i < 30; i++) {
        s.writeSession("default", { ...parked(), scenario: `${i}-${blob}` });
        await new Promise((r) => setTimeout(r, 5));
      }
    } finally {
      writeFileSync(stop, "stop");
    }
    const { reads, broken } = JSON.parse(await printed) as { reads: number; broken: number };
    expect(broken).toBe(0);
    expect(reads).toBeGreaterThan(10);
    // …and publishing leaves nothing of its own behind.
    expect(readdirSync(sessionsDir)).toEqual(["default.json"]);
  });

  it("keeps the record that was there when the write fails", () => {
    const before = parked();
    s.writeSession("default", before);
    const failing = () => {
      throw new Error("disk full");
    };
    expect(() =>
      s.writeSession("default", { ...before, daemon: "d-1a2b3c4d-default-next" }, failing),
    ).toThrow(/disk full/);
    expect(s.readSession("default")).toEqual(before);
  });
});
