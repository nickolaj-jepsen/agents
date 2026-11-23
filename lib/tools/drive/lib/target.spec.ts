import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import type { Session } from "./session.ts";
import { TerminalTarget, VscodeTarget } from "./target.ts";
import type { VscodeSession } from "./vscode.ts";

const scratch: string[] = [];
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), "drive-sweep-"));
  scratch.push(root);
  const runDir = join(root, "run");
  return { runDir, out: join(root, "review") };
}

const png = (file: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "fixture");
  return file;
};

test("terminal sweep writes all four sizes outside the run and restores its size", async () => {
  const { runDir, out } = setup();
  const resize = vi.fn();
  const terminal = { runDir, resize, size: () => ({ cols: 90, rows: 30 }), png };
  const target = new TerminalTarget("claude", terminal as unknown as Session);
  const files = await target.sweep(out);
  rmSync(runDir, { recursive: true, force: true });
  expect(files).toEqual(["70x24", "112x32", "160x45", "240x60"].map((s) => join(out, `${s}.png`)));
  expect(resize).toHaveBeenLastCalledWith(90, 30);
});

test("VS Code sweep uses the requested directory and restores the native viewport", async () => {
  const { runDir, out } = setup();
  const vscode = {
    runDir,
    state: {},
    resize: vi.fn(),
    setScale: vi.fn(),
    useWindowSize: vi.fn(),
    shot: png,
  };
  const target = new VscodeTarget(vscode as unknown as VscodeSession);
  const files = await target.sweep(out);
  expect(files.map((file) => dirname(file))).toEqual([out, out]);
  expect(files.map((file) => basename(file))).toEqual(["420x800.png", "1280x720.png"]);
  expect(vscode.useWindowSize).toHaveBeenCalledOnce();
});
