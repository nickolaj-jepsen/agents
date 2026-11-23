import { describe, expect, test } from "vitest";
import { textOf, widthOf } from "@agents/kit-core/lines.ts";
import { fileUrl, fitImage } from "./internal.ts";
import { imageStories } from "./stories.ts";
import { imageGallery } from "./terminal.ts";

describe("every image-gallery story", () => {
  test.each(imageStories.map((s) => ({ id: `${s.component}/${s.state}`, story: s })))(
    "$id fits every width",
    ({ story }) => {
      for (let width = 32; width <= 130; width++)
        for (const l of imageGallery({ ...story.model, columns: width }))
          expect(widthOf(l), `${width}: ${textOf(l)}`).toBeLessThanOrEqual(width);
    },
  );
});

describe("fitImage", () => {
  test("keeps the aspect ratio within the box, a cell being twice as tall as wide", () => {
    expect(fitImage({ width: 64, height: 36 }, { columns: 40, rows: 15 })).toEqual({
      columns: 40,
      rows: 11,
    });
    expect(fitImage({ width: 24, height: 64 }, { columns: 40, rows: 12 })).toEqual({
      columns: 9,
      rows: 12,
    });
  });
  test("never exceeds 255 cells and falls back to 16:10", () => {
    expect(fitImage(null, { columns: 1000, rows: 1000 })).toEqual({ columns: 255, rows: 80 });
  });
});

test("fileUrl escapes each part and keeps the slashes", () => {
  expect(fileUrl("/a b/c#1.png")).toBe("file:///a%20b/c%231.png");
});

test("a gallery is image, blank, link rows with a blank between images", () => {
  const image = { key: "a", source: { png: "x" }, size: null, alt: "alt", path: "/p/a.png" };
  const rows = imageGallery({
    images: [image, { ...image, key: "b", path: undefined }],
    columns: 30,
  });
  expect(rows.map((l) => l.slot?.kind ?? "")).toEqual(["image", "", "link", "", "image"]);
});
