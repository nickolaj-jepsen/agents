/**
 * Captures a scenario's screen at each of its sizes and compares it with the stored
 * snapshot. A difference fails; `E2E_UPDATE=1` (or `vitest -u`) accepts it. The PNG
 * beside each snapshot is for review and is never compared: it is not committed, and a run
 * draws it only on request (`E2E_PNG=1`) or as the evidence of a difference.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { snapshotPath, type Resolved } from "./scenario.ts";
import type { Session, Size } from "./session.ts";

export type Capture = {
  size: Size;
  /** The masked, cropped text. */
  actual: string;
  /** The stored snapshot, undefined when there is none yet. */
  expected: string | undefined;
  snap: string;
  png: string;
};

const actualOf = (path: string) => path.replace(/\.(snap|png)$/, ".actual.$1");

/** Whether a run draws a PNG beside every snapshot. */
export const wantsPng = () => !!process.env.E2E_PNG && process.env.E2E_PNG !== "0";

/** Resizes through the scenario's sizes and reads the screen at each. */
export async function capture(session: Session, r: Resolved): Promise<Capture[]> {
  const out: Capture[] = [];
  await session.waitHintsGone();
  for (const size of r.sizes) {
    const now = await session.size();
    if (now.cols !== size[0] || now.rows !== size[1]) await session.resize(size[0], size[1]);
    const snap = snapshotPath(r, size, "snap");
    const png = snapshotPath(r, size, "png");
    mkdirSync(dirname(snap), { recursive: true });
    const actual = await session.snapshot(
      `${r.plugin}/${r.harness}/${r.name} ${size[0]}x${size[1]}`,
      r.region,
      r.mask,
    );
    const expected = existsSync(snap) ? readFileSync(snap, "utf8") : undefined;
    // Review only: a glyph the rasterizer has no font for (an emoji) must not fail the text.
    if (wantsPng() || (expected !== actual && !updating()))
      await session.png(actualOf(png)).catch(() => undefined);
    out.push({ size, actual, expected, snap, png });
  }
  return out;
}

export const updating = () => !!process.env.E2E_UPDATE && process.env.E2E_UPDATE !== "0";

/** Whether the screen is not what the snapshot holds (an update accepts anything). */
export const differs = (c: Capture) => !updating() && c.expected !== c.actual;

/** Stores or settles one capture. Returns what is wrong with it, undefined when it passes. */
export function settleCapture(c: Capture): string | undefined {
  if (updating()) {
    writeFileSync(c.snap, c.actual);
    if (existsSync(actualOf(c.png))) renameSync(actualOf(c.png), c.png);
    rmSync(actualOf(c.snap), { force: true });
    return undefined;
  }
  if (c.expected === c.actual) {
    if (existsSync(actualOf(c.png))) renameSync(actualOf(c.png), c.png);
    rmSync(actualOf(c.snap), { force: true });
    return undefined;
  }
  writeFileSync(actualOf(c.snap), c.actual);
  return c.expected === undefined
    ? `no snapshot at ${c.snap}; accept it with E2E_UPDATE=1`
    : `differs from ${c.snap} (this run: ${actualOf(c.snap)}, ${actualOf(c.png)}); accept with E2E_UPDATE=1`;
}
