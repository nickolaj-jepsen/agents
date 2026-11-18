import { describe, expect, it } from "vitest";
import {
  MAX_INLINE_BYTES,
  attachmentPreviews,
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

describe("attachmentPreviews", () => {
  const output = {
    caption: "Two files",
    attachments: [
      {
        path: "/tmp/chart.png",
        size: 123,
        isImage: true,
        media_type: "image/png",
        scaled: { original_width: 1200, original_height: 600 },
      },
      { path: "/tmp/report.pdf", size: 456, isImage: false },
    ],
  };

  it("uses file sources and preserves non-image attachments as paths", () => {
    expect(attachmentPreviews(output)).toEqual({
      caption: "Two files",
      images: [
        {
          key: "0:/tmp/chart.png",
          source: { file: "/tmp/chart.png", format: "png", generation: 123 },
          size: { width: 1200, height: 600 },
          alt: "[image] chart.png",
          path: "/tmp/chart.png",
        },
      ],
      others: ["/tmp/report.pdf"],
    });
  });

  it("accepts PNG media types without relying on the extension", () => {
    const result = attachmentPreviews({
      attachments: [{ path: "/tmp/blob", isImage: true, media_type: "image/png" }],
    });
    expect(result?.images[0]?.size).toBeNull();
  });

  it("uses an upload UUID as the content generation when one is available", () => {
    const file = {
      path: "/tmp/chart.png",
      size: 123,
      isImage: true,
      media_type: "image/png",
    };
    const one = attachmentPreviews({ attachments: [{ ...file, file_uuid: "upload-one" }] });
    const two = attachmentPreviews({ attachments: [{ ...file, file_uuid: "upload-two" }] });
    const first = one?.images[0]?.source;
    const second = two?.images[0]?.source;
    expect(first && "generation" in first ? first.generation : undefined).not.toBe(123);
    expect(first && "generation" in first ? first.generation : undefined).not.toBe(
      second && "generation" in second ? second.generation : undefined,
    );
  });

  it("passes attach-only, errored, relative and non-PNG results through", () => {
    expect(attachmentPreviews({ ...output, display: "attach" })).toBeNull();
    expect(
      attachmentPreviews({
        attachments: [{ ...output.attachments[0], upload_error: "too large" }],
      }),
    ).toBeNull();
    expect(
      attachmentPreviews({
        attachments: [{ path: "chart.png", isImage: true, media_type: "image/png" }],
      }),
    ).toBeNull();
    expect(
      attachmentPreviews({
        attachments: [{ path: "/tmp/photo.jpg", isImage: true, media_type: "image/jpeg" }],
      }),
    ).toBeNull();
    expect(
      attachmentPreviews({
        attachments: [
          output.attachments[0],
          { path: "/tmp/photo.jpg", isImage: true, media_type: "image/jpeg" },
        ],
      }),
    ).toBeNull();
  });
});
