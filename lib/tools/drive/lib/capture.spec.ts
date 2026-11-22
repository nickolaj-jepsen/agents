/**
 * What a screen capture is for decides how it is read. The gate reads the stored snapshot, waits
 * for the screen to settle on it and leaves evidence when it differs; media takes the screen as it
 * is, whatever the run's own flags say, and fails only when the screen or its picture cannot be had.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import type { Resolved, ScenarioSet } from "./scenario.ts";
import type { Session, Size } from "./session.ts";

// A checkout of our own: `snapshotPath` looks the package up under this root.
const root = mkdtempSync(join(tmpdir(), "drive-capture-"));
const snapDir = join(root, "apps", "fake", "src", "e2e", "__snapshots__", "pi");
mkdirSync(snapDir, { recursive: true });
writeFileSync(join(snapDir, "look@70x24.snap"), "the stored screen");
const previousRoot = process.env.AGENTS_DRIVE_ROOT;
process.env.AGENTS_DRIVE_ROOT = root;

const { capture, captureMedia } = await import("./check.ts");
const { setOptions } = await import("./options.ts");
const { resolveScenario } = await import("./scenario.ts");

afterAll(() => {
  if (previousRoot === undefined) delete process.env.AGENTS_DRIVE_ROOT;
  else process.env.AGENTS_DRIVE_ROOT = previousRoot;
  rmSync(root, { recursive: true, force: true });
});

const set: ScenarioSet = {
  plugin: "fake",
  harness: "pi",
  scenarios: { look: { size: [70, 24], sizes: [[70, 24]], steps: [] } },
};
const look: Resolved = resolveScenario(set, "look");

/** A session whose screen is `screen`, and which records the pictures drawn of it. */
function session(screen: string, png?: (path: string) => void): Session {
  const size: Size = [70, 24];
  return {
    harness: "pi",
    waitHintsGone: async () => undefined,
    size: async () => size,
    resize: async () => undefined,
    snapshot: async () => screen,
    png: async (path: string) => {
      if (png) png(path);
      return path;
    },
  } as unknown as Session;
}

it("captures media as the screen is now, whatever the test flags say", async () => {
  // `--png --update` would compare nothing and draw everything; media must do the same because it
  // is media, not because a test-only flag was set.
  setOptions({ png: false, update: true });
  const drawn: string[] = [];
  const captures = await captureMedia(
    session("the screen now", (p) => drawn.push(p)),
    look,
  );

  expect(captures).toHaveLength(1);
  expect(captures[0]).toMatchObject({ actual: "the screen now", expected: undefined });
  // The picture is the evidence recording crops, and no snapshot was accepted.
  expect(drawn).toEqual([join(snapDir, "look@70x24.actual.png")]);
  expect(readFileSync(join(snapDir, "look@70x24.snap"), "utf8")).toBe("the stored screen");
});

it("fails media capture when there is no picture", async () => {
  setOptions({ png: true, update: false });
  const broken = session("the screen now", () => {
    throw new Error("no picture");
  });
  await expect(captureMedia(broken, look)).rejects.toThrow(/no picture/);
});

it("still compares the gate's capture with the stored snapshot, and acceptance stays put", async () => {
  setOptions({ png: false, update: false });
  const compared = await capture(session("the stored screen"), look);
  expect(compared[0]).toMatchObject({ actual: "the stored screen", expected: "the stored screen" });

  // `--update` leaves the reading as it is: accepting is `settleCapture`'s, not the capture's.
  setOptions({ update: true });
  const accepted = await capture(session("anything"), look);
  expect(accepted[0]).toMatchObject({ actual: "anything", expected: "the stored screen" });
});
