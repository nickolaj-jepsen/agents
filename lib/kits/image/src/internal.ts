/** The image gallery's own helpers, for its drawing and its specs. No host imports. */
import type { ImageBox, ImageGalleryTerminal, ImageSize } from "./contract.ts";

/** Fits an image inside a terminal cell box without changing its aspect ratio. */
export function fitImage(
  size: ImageSize | null,
  options: Pick<ImageGalleryTerminal, "columns" | "rows" | "cellRatio">,
): ImageBox {
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
