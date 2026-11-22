/**
 * A recording is staged in a folder of its own and published whole: a failed capture keeps that
 * stage and says where it is, while the published media stay as they were, and a successful
 * publication replaces only the files its own recorder wrote.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it, vi } from "vitest";
import { photograph, publish, retainFailure, type Photo } from "./media.ts";
import { isVscodeFile } from "./site.ts";

const dir = mkdtempSync(join(tmpdir(), "drive-media-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it("publishes one recorder's files and keeps the other recorder's", () => {
  // A package folder as both recorders left it: the terminal's demo and still, the VS Code pictures.
  const dest = join(dir, "media", "answer");
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, "demo.mp4"), "the old demo");
  writeFileSync(join(dest, "old-still.png"), "a still the new run does not make");
  writeFileSync(join(dest, "vscode-panel.png"), "the extension's");
  writeFileSync(join(dest, "media-vscode.json"), "the extension's manifest");
  // The new terminal recording: a demo and its poster, and a manifest.
  const stage = mkdtempSync(join(dir, "stage-"));
  writeFileSync(join(stage, "demo.mp4"), "the new demo");
  writeFileSync(join(stage, "demo.png"), "its poster");
  writeFileSync(join(stage, "media.json"), "the terminal's manifest");

  publish(dest, stage, (f) => !isVscodeFile(f));

  expect(readdirSync(dest).sort()).toEqual([
    "demo.mp4",
    "demo.png",
    "media-vscode.json",
    "media.json",
    "vscode-panel.png",
  ]);
  expect(readFileSync(join(dest, "demo.mp4"), "utf8")).toBe("the new demo");
  // The old still was this recorder's and is gone; the extension's are untouched.
  expect(existsSync(join(dest, "old-still.png"))).toBe(false);
  expect(readFileSync(join(dest, "vscode-panel.png"), "utf8")).toBe("the extension's");
  // The stage moved, rather than being left behind.
  expect(existsSync(stage)).toBe(false);
});

it("keeps a failed recording's stage and prints where it is", () => {
  const stage = mkdtempSync(join(dir, "failed-"));
  writeFileSync(join(stage, "vscode-panel@failed.png"), "what the failed step left");
  const said: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((line) => {
    said.push(String(line));
  });
  try {
    const err = retainFailure(stage, "2 scenario(s) failed");
    expect(err.message).toContain("2 scenario(s) failed");
    expect(err.message).toContain(stage);
  } finally {
    spy.mockRestore();
  }
  // The evidence is kept, and its folder named in the output a maintainer reads.
  expect(existsSync(join(stage, "vscode-panel@failed.png"))).toBe(true);
  expect(said.join("\n")).toContain(stage);
});

it("fails a picture whose panel still has undrawn pictures", async () => {
  const files: string[] = [];
  let closed = 0;
  const stillUndrawn = (left: number): Photo => ({
    shot: async (file) => {
      files.push(file);
    },
    undrawn: async () => left,
    close: () => {
      closed++;
    },
  });
  // The first capture is the one kept: a window of its own is not gone to for a second try.
  const opened: number[] = [];
  const open = (left: number) => async () => {
    opened.push(left);
    return stillUndrawn(left);
  };

  await expect(photograph(open(2), "/tmp/panel.png")).rejects.toThrow(/2 picture\(s\)/);
  expect(files).toEqual(["/tmp/panel.png"]);
  expect(opened).toEqual([2]);
  // A failed capture still lets go of its window; the stage keeps what it drew.
  expect(closed).toBe(1);

  await photograph(open(0), "/tmp/panel.png");
  expect(opened).toEqual([2, 0]);
  expect(closed).toBe(2);
});
