/**
 * Cuts a kit scenario's screenshot down to the scenario's region, so a picture shows the
 * component and not the terminal round it.
 *
 * tui-test's screenshot is a window: purple padding, a title bar, then the cell grid, at a
 * fixed cell size. The geometry below was read off those images, so a screenshot whose size does
 * not match it for its grid is skipped rather than cropped wrong.
 */
import { createHash } from "node:crypto";
import { crop, decode, encode } from "./png.ts";

const cell = { w: 10, h: 21 };
const origin = { x: 39, y: 65 };
const margin = { right: 39, bottom: 39 };

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
  if (
    img.w !== origin.x + cell.w * cols + margin.right ||
    img.h !== origin.y + cell.h * rows + margin.bottom
  )
    return undefined;
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
