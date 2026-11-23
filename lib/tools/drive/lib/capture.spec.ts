/**
 * What a screen capture is for decides how it is read. The gate reads the stored snapshot, waits
 * for the screen to settle on it and leaves evidence when it differs; media takes the screen as it
 * is, whatever the run's own flags say, and fails only when the screen or its picture cannot be had.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const { actualOf, capture, captureMedia, gateCapture, settleCapture } = await import("./check.ts");
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
function session(screen: string | ((size: Size) => string), png?: (path: string) => void): Session {
  let size: Size = [70, 24];
  return {
    harness: "pi",
    waitHintsGone: async () => undefined,
    size: async () => ({ cols: size[0], rows: size[1] }),
    resize: async (cols: number, rows: number) => {
      size = [cols, rows];
    },
    snapshot: async () => (typeof screen === "string" ? screen : screen(size)),
    png: async (path: string) => {
      if (png) png(path);
      return path;
    },
  } as unknown as Session;
}

it("captures each media size privately, where a passing gate cannot take its picture", async () => {
  setOptions({ png: false, update: false });
  const [gate] = await capture(session("the stored screen"), look);
  const stage = join(root, "media");
  const captures = await captureMedia(
    session(
      (size) => `screen at ${size.join("x")}`,
      (png) => {
        mkdirSync(join(stage, "pi"), { recursive: true });
        writeFileSync(png, "recording");
        // This runs while the picture is waiting to be cropped.
        expect(settleCapture(gate!)).toBeUndefined();
      },
    ),
    {
      ...look,
      sizes: [
        [70, 24],
        [112, 32],
      ],
    },
    stage,
  );

  expect(captures.map(({ actual, png }) => [actual, png])).toEqual([
    ["screen at 70x24", join(stage, "pi", "look@70x24.png")],
    ["screen at 112x32", join(stage, "pi", "look@112x32.png")],
  ]);
  for (const { png } of captures) expect(readFileSync(png, "utf8")).toBe("recording");
  expect(existsSync(gate!.png)).toBe(false);
  expect(existsSync(actualOf(gate!.png))).toBe(false);
  expect(readFileSync(gate!.snap, "utf8")).toBe("the stored screen");
});

it("fails media capture when there is no picture", async () => {
  setOptions({ png: true, update: false });
  const broken = session("the screen now", () => {
    throw new Error("no picture");
  });
  await expect(captureMedia(broken, look, join(root, "media"))).rejects.toThrow(/no picture/);
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

it("leaves a known failure to the gate without comparing its screen", async () => {
  setOptions({ png: false, update: false });
  const known: Resolved = resolveScenario(
    {
      ...set,
      scenarios: {
        ...set.scenarios,
        known: { size: [70, 24], sizes: [[70, 24]], steps: [], expectFail: "broken until fixed" },
      },
    },
    "known",
  );
  const drawn: string[] = [];
  expect(
    await gateCapture(
      session("the screen now", (p) => drawn.push(p)),
      known,
    ),
  ).toEqual([]);
  // No comparison and no evidence: the gate does not read a known failure's screen.
  expect(drawn).toEqual([]);
});
