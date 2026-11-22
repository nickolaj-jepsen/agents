/**
 * A kit story's picture is cut to the scenario's region whatever engine drew it: the in-process
 * rasterizer and the daemon frame their cell grid differently, and a crop that guesses the frame
 * would cut the wrong rows. Geometry is read off the image, so a picture of neither frame is left
 * alone rather than cropped wrong.
 */
import { expect, it } from "vitest";
import { cropToRegion } from "./crop.ts";
import { encode } from "./png.ts";

/** A blank picture of `w` by `h` pixels, as a screenshot of the whole window would be. */
const shot = (w: number, h: number) =>
  encode({ w, h, channels: 3, data: new Uint8Array(w * h * 3) });

/** The window the in-process rasterizer draws a `cols` by `rows` grid in (lib/tools/drive/tui-test.toml). */
const libWindow = (cols: number, rows: number) => shot(39 + 10 * cols + 39, 65 + 21 * rows + 39);
/** The window the daemon draws the same grid in: the config's content padding, no title bar. */
const daemonWindow = (cols: number, rows: number) => shot(16 + 10 * cols + 16, 16 + 21 * rows + 16);

const header = "@2,2 (66x7)";

it("crops the in-process rasterizer's window", () => {
  const cut = cropToRegion(libWindow(70, 24), header, 70, 24);
  expect(cut).toMatchObject({ width: 660, height: 147 });
});

it("crops the daemon's window, which has a different frame", () => {
  const cut = cropToRegion(daemonWindow(70, 24), header, 70, 24);
  expect(cut).toMatchObject({ width: 660, height: 147 });
});

it("leaves a picture of neither frame alone", () => {
  expect(cropToRegion(libWindow(70, 24), "@2,2 (66x7)", 112, 32)).toBeUndefined();
  expect(cropToRegion(shot(700, 500), header, 70, 24)).toBeUndefined();
  expect(cropToRegion(daemonWindow(70, 24), "no region", 70, 24)).toBeUndefined();
});
