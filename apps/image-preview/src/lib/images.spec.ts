import { describe, expect, it } from "vitest";
import {
  MAX_INLINE_BYTES,
  attachmentImages,
  readJpeg,
  base64ByteLength,
  pngSize,
  readPreview,
} from "./images.ts";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAYAAAA5DDySAAAAdklEQVR42u3ZsRGAIAwFUIZxAAtHsLO2ZyVXYyHcAAu5Q8wrfpm78JrkQtqOXFtZ1r2Z2esTAAAAAAAAEBjg7w98qgfQo4FyncMCAAAAAADeAPQYMyMBPrEJAgAAAAAAAJMC2AQBAHARAgAAQFwAP0MAAIQGuAEhKJcojry0RgAAAABJRU5ErkJggg==";

const read = (base64 = PNG, originalSize = 176) => ({
  type: "image",
  file: {
    type: "image/png",
    base64,
    originalSize,
    dimensions: { originalWidth: 64, originalHeight: 36 },
  },
});

describe("PNG parsing", () => {
  it("reads IHDR dimensions without decoding the image", () => {
    expect(pngSize(PNG)).toEqual({ width: 64, height: 36 });
  });

  it("rejects other signatures, short data and malformed headers", () => {
    expect(pngSize("not a png")).toBeNull();
    expect(pngSize(PNG.slice(0, 20))).toBeNull();
    expect(pngSize(`AAAA${PNG.slice(4)}`)).toBeNull();
  });

  it("counts decoded base64 bytes, including padding and whitespace", () => {
    expect(base64ByteLength("TQ==")).toBe(1);
    expect(base64ByteLength("TWE=")).toBe(2);
    expect(base64ByteLength("TWFu")).toBe(3);
    expect(base64ByteLength("TW\nFu")).toBe(3);
  });
});

describe("readPreview", () => {
  it("uses inline PNG bytes and the actual image dimensions", () => {
    const preview = readPreview(read(), "/tmp/a picture.png");
    expect(preview).toMatchObject({
      source: { png: PNG },
      size: { width: 64, height: 36 },
      path: "/tmp/a picture.png",
      alt: "[image] a picture.png",
    });
  });

  it("uses a per-call key and only makes absolute paths clickable", () => {
    expect(readPreview(read(), "chart.png", "call-1")).toMatchObject({
      key: "call-1",
      alt: "[image] chart.png",
    });
    expect(readPreview(read(), "chart.png", "call-1")?.path).toBeUndefined();
    expect(readPreview(read(), "/tmp/chart.png", "call-2")?.path).toBe("/tmp/chart.png");
  });

  it("uses the source file when inline bytes would exceed Image's limit", () => {
    const huge = PNG.padEnd(Math.ceil((MAX_INLINE_BYTES * 4) / 3) + 8, "A");
    expect(readPreview(read(huge, MAX_INLINE_BYTES + 1), "/tmp/huge.png")?.source).toEqual({
      file: "/tmp/huge.png",
      format: "png",
      generation: MAX_INLINE_BYTES + 1,
    });
    expect(readPreview(read(huge, MAX_INLINE_BYTES + 1))).toBeNull();
  });

  it("leaves unsupported formats and malformed images to the host", () => {
    expect(readPreview({ type: "text", file: {} })).toBeNull();
    expect(readPreview({ type: "image", file: { type: "image/jpeg", base64: PNG } })).toBeNull();
    expect(readPreview(read("AAAA"))).toBeNull();
  });
});

describe("attachmentImages", () => {
  const png = {
    path: "/tmp/chart.png",
    isImage: true,
    scaled: { original_width: 1200, original_height: 600 },
  };
  const jpeg = { path: "/tmp/photo", isImage: true, media_type: "image/jpeg" };

  it("selects PNG and JPEG without replacing other attachments", () => {
    expect(
      attachmentImages({
        attachments: [png, jpeg, { path: "/tmp/report.pdf", isImage: false }],
      }),
    ).toMatchObject([
      { path: png.path, format: "png", size: { width: 1200, height: 600 } },
      { path: jpeg.path, format: "jpeg", size: null },
    ]);
  });

  it("skips attach-only, invalid, failed and unsupported attachments", () => {
    expect(attachmentImages({ display: "attach", attachments: [png] })).toEqual([]);
    expect(
      attachmentImages({
        attachments: [
          { ...png, upload_error: "too large" },
          { ...png, partial_error: "failed" },
          { ...png, pathValidated: false },
          { ...png, path: "chart.png" },
          { ...png, media_type: "image/gif" },
        ],
      }),
    ).toEqual([]);
  });

  it("uses the upload UUID as content generation", () => {
    const [one, two] = attachmentImages({
      attachments: [
        { ...png, file_uuid: "one" },
        { ...png, file_uuid: "two" },
      ],
    });
    expect(one?.generation).toBeTypeOf("number");
    expect(one?.generation).not.toBe(two?.generation);
  });
});

describe("readJpeg", () => {
  it("requires JPEG bytes in an image/jpeg Read result", () => {
    const jpeg = (base64: string) => ({ type: "image", file: { type: "image/jpeg", base64 } });
    expect(readJpeg(jpeg(PNG))).toBeNull();
    expect(readJpeg(jpeg("/9j/4A=="))).toBe("/9j/4A==");
  });
});
