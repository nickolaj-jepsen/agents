/** The image gallery's contract. No host imports. */
import type { ImageSource } from "@agents/kit-core/lines.ts";

export type ImageSize = { width: number; height: number };
export type ImageBox = { columns: number; rows: number };

export type FitImageOptions = {
  /** Available terminal columns; the result never exceeds 255. */
  columns: number;
  /** Available terminal rows; the result never exceeds 255. @default 30 */
  rows?: number;
  /** Terminal cell height divided by its width. @default 2 */
  cellRatio?: number;
};

export type ImageItem = {
  /** A stable address among this gallery's images. */
  key: string;
  /** Inline PNG bytes, or a local PNG file for the terminal to read. */
  source: ImageSource;
  /** Pixel dimensions; null uses a 16:10 box until dimensions are known. */
  size: ImageSize | null;
  /** Fallback text where the terminal cannot draw images. */
  alt: string;
  /** An absolute local path, drawn as a dim link below the image. */
  path?: string;
};

export type ImageGalleryOptions = FitImageOptions & {
  /** Optional dim text above the gallery. */
  caption?: string;
};
