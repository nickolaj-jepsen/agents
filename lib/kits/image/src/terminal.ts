/**
 * Images as styled lines, for the terminal only: the graphical clients show images themselves.
 * An image is one line with an `image` slot, whose alt text stands in where the client cannot
 * draw one (pi, a terminal without images); its path is `link` lines under it.
 */
import { blank, clamp, line, span, type Line } from "@agents/kit-core/lines.ts";
import type {
  FitImageOptions,
  ImageBox,
  ImageGalleryOptions,
  ImageItem,
  ImageSize,
} from "./contract.ts";

/** Fits an image inside a terminal cell box without changing its aspect ratio. */
export function fitImage(size: ImageSize | null, options: FitImageOptions): ImageBox {
  const bound = (value: number, fallback: number) =>
    Math.max(1, Math.min(255, Math.floor(Number.isFinite(value) ? value : fallback)));
  const columns = bound(options.columns, 1);
  const rows = bound(options.rows ?? 30, 30);
  const ratio =
    Number.isFinite(options.cellRatio) && (options.cellRatio ?? 0) > 0 ? options.cellRatio! : 2;
  const image =
    size &&
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
      ? size
      : { width: 16, height: 10 };
  const aspect = image.width / image.height;

  let fittedColumns = columns;
  let fittedRows = Math.max(1, Math.round(fittedColumns / aspect / ratio));
  if (fittedRows > rows) {
    fittedRows = rows;
    fittedColumns = Math.max(1, Math.round(fittedRows * ratio * aspect));
  }
  return {
    columns: Math.max(1, Math.min(columns, fittedColumns)),
    rows: Math.max(1, Math.min(rows, fittedRows)),
  };
}

/** Encodes an absolute path as a file URL without escaping its slashes. */
export const fileUrl = (path: string) =>
  `file://${path.split("/").map(encodeURIComponent).join("/")}`;

/**
 * Draws images at their aspect ratios, a blank row between parts, each with its path as a dim
 * link below it. `columns` is the room for the lines too.
 */
export function imageGallery(images: readonly ImageItem[], options: ImageGalleryOptions): Line[] {
  const room = Math.max(1, Math.floor(options.columns));
  const parts: Line[][] = [];
  if (options.caption)
    parts.push(clamp(options.caption, room).map((row) => line([span(row, { role: "dim" })])));
  for (const image of images) {
    const box = fitImage(image.size, options);
    const rows: Line[] = [
      {
        spans: [span(image.alt, { role: "dim" })],
        slot: { kind: "image", source: image.source, ...box, alt: image.alt },
      },
    ];
    if (image.path) {
      const href = fileUrl(image.path);
      rows.push(
        blank(),
        ...clamp(image.path, room).map((row): Line => ({
          spans: [span(row, { role: "dim" })],
          slot: { kind: "link", href },
        })),
      );
    }
    parts.push(rows);
  }
  return parts.flatMap((part, i) => (i ? [blank(), ...part] : part));
}
