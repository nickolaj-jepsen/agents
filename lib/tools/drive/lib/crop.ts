/**
 * Cuts a kit scenario's screenshot down to the scenario's region, so a picture shows the
 * component and not the terminal round it.
 *
 * tui-test's screenshot is a window: padding, then the cell grid, at a fixed cell size. The
 * geometry below was read off those images, so a screenshot whose size does not match a window
 * for its grid is skipped rather than cropped wrong. Two windows are known, because the two
 * engines draw their own frame: the in-process rasterizer's (a title bar and purple padding,
 * `tui-test.toml`'s defaults) and the daemon's (the config's content padding alone). Recording
 * runs on the daemon, and the crops are the same component either way.
 */
import { createHash } from "node:crypto";
import { crop, decode, encode } from "./png.ts";

const cell = { w: 10, h: 21 };

/** A window's frame around the cell grid: where the grid starts, and how much follows it. */
type Frame = { origin: { x: number; y: number }; margin: { right: number; bottom: number } };

const FRAMES: Frame[] = [
  // LibTerm: the library's default window (a title bar above the grid, purple padding round it).
  { origin: { x: 39, y: 65 }, margin: { right: 39, bottom: 39 } },
  // DaemonTerm: `[recording.style] content_padding = 16`, no title bar, and the grid's top edge a
  // pixel into that padding (antialiasing); the canvas still ends at the padding.
  { origin: { x: 16, y: 15 }, margin: { right: 16, bottom: 17 } },
];

/** The frame of a `cols` by `rows` grid that a picture of `w` by `h` pixels is, if any. */
const frameOf = (w: number, h: number, cols: number, rows: number): Frame | undefined =>
  FRAMES.find(
    (f) =>
      w === f.origin.x + cell.w * cols + f.margin.right &&
      h === f.origin.y + cell.h * rows + f.margin.bottom,
  );

export type Cropped = { png: Uint8Array; width: number; height: number; hash: string };

/**
 * The region of `shot` (a screenshot of `cols` by `rows` cells) that the snapshot's header line
 * names (`… @x,y (wxh)`), or undefined when the header has none or the shot is not a window of
 * that grid.
 */
export function cropToRegion(
  shot: Uint8Array,
  header: string,
  cols: number,
  rows: number,
): Cropped | undefined {
  const r = /@(\d+),(\d+) \((\d+)x(\d+)\)/.exec(header);
  if (!r) return undefined;
  const img = decode(shot);
  const origin = frameOf(img.w, img.h, cols, rows)?.origin;
  if (!origin) return undefined;
  const x0 = Math.max(0, Number(r[1]));
  const y0 = Math.max(0, Number(r[2]));
  const x1 = Math.min(cols, Number(r[1]) + Number(r[3]));
  const y1 = Math.min(rows, Number(r[2]) + Number(r[4]));
  const cut = crop(
    img,
    origin.x + x0 * cell.w,
    origin.y + y0 * cell.h,
    (x1 - x0) * cell.w,
    (y1 - y0) * cell.h,
  );
  const hash = createHash("sha256")
    .update(`${cut.w}x${cut.h}x${cut.channels}`)
    .update(cut.data)
    .digest("hex")
    .slice(0, 16);
  return { png: encode(cut), width: cut.w, height: cut.h, hash };
}
