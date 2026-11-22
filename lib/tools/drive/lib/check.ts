/**
 * Captures a scenario's screen at each of its sizes. The gate's `capture` reads it against the
 * stored snapshot: a difference fails, `settleCapture` accepts or leaves the evidence, and the PNG
 * beside each snapshot is for review only (it is not committed, and a run draws it only on request
 * (`drive test --png`) or as the evidence of a difference). Media's `captureMedia` takes the screen
 * as it is, with no stored snapshot or test flag deciding what it gets.
 */
import { options } from "./options.ts";
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

export const actualOf = (path: string) => path.replace(/\.(snap|png)$/, ".actual.$1");

/** Whether a run draws a PNG beside every snapshot. */
export const wantsPng = () => !!options.png;

/** How long a snapshot that is not yet the stored one is read again, and how often. */
export const STEADY = { timeout: 4000, poll: 150 };

/**
 * The region's snapshot once the screen has finished drawing it. The settle before it watches the
 * text only, so a style that lands late (a focus colour, a dim) or a redraw after a quiet spell can
 * still be caught half done. It is read again until it is the stored snapshot, or it reads the
 * same twice in a row and `STEADY.timeout` has passed; without a stored one, two alike suffice.
 */
async function steadySnapshot(
  session: Session,
  title: string,
  r: Resolved,
  expected: string | undefined,
): Promise<string> {
  const read = () => session.snapshot(title, r.region, r.mask);
  const start = Date.now();
  let last = await read().catch((err: unknown) => err as Error);
  for (;;) {
    if (last === expected) return last;
    await new Promise((done) => setTimeout(done, STEADY.poll));
    const now = await read().catch((err: unknown) => err as Error);
    const same = typeof now === "string" && now === last;
    last = now;
    if (same && (expected === undefined || Date.now() - start >= STEADY.timeout)) return now;
    if (Date.now() - start >= STEADY.timeout * 2) {
      if (typeof now === "string") return now;
      throw now;
    }
  }
}

/** The scenario's sizes, in order, after the agent's start-up hints have gone. */
async function sizes(session: Session, r: Resolved): Promise<Size[]> {
  await session.waitHintsGone();
  return r.sizes;
}

/** Resizes to `size` and reads the region once it is what `expected` says, or still twice. */
async function read(session: Session, r: Resolved, size: Size, expected?: string) {
  const now = await session.size();
  if (now.cols !== size[0] || now.rows !== size[1]) await session.resize(size[0], size[1]);
  return steadySnapshot(
    session,
    `${r.label}/${r.harness}/${r.name} ${size[0]}x${size[1]}`,
    r,
    expected,
  );
}

/** Resizes through the scenario's sizes and reads the screen at each. */
export async function capture(session: Session, r: Resolved): Promise<Capture[]> {
  const out: Capture[] = [];
  for (const size of await sizes(session, r)) {
    const snap = snapshotPath(r, size, "snap");
    const png = snapshotPath(r, size, "png");
    mkdirSync(dirname(snap), { recursive: true });
    const expected = existsSync(snap) ? readFileSync(snap, "utf8") : undefined;
    const actual = await read(session, r, size, updating() ? undefined : expected);
    // Review only: a glyph the rasterizer has no font for (an emoji) must not fail the text.
    if (wantsPng() || (expected !== actual && !updating()))
      await session.png(actualOf(png)).catch(() => undefined);
    out.push({ size, actual, expected, snap, png });
  }
  return out;
}

/**
 * The screen as it is now, for media: no stored snapshot is read or compared, and every size is
 * drawn whatever the run's own flags say. A picture that cannot be had still fails.
 */
export async function captureMedia(session: Session, r: Resolved): Promise<Capture[]> {
  const out: Capture[] = [];
  for (const size of await sizes(session, r)) {
    const snap = snapshotPath(r, size, "snap");
    const png = snapshotPath(r, size, "png");
    const actual = await read(session, r, size);
    await session.png(actualOf(png));
    out.push({ size, actual, expected: undefined, snap, png });
  }
  return out;
}

export const updating = () => !!options.update;

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
    ? `no snapshot at ${c.snap}; accept it with \`drive test --update\``
    : `differs from ${c.snap} (this run: ${actualOf(c.snap)}, ${actualOf(c.png)}); accept with \`drive test --update\``;
}
