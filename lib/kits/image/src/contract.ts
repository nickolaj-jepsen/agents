/** The image gallery's contract: its model, which only a terminal draws. No host imports. */
import type { ImageSource } from "@agents/kit-core/lines.ts";
import { modelFields } from "@agents/kit-core/manifest.ts";
import type { Props, Surface } from "@agents/kit-core/surfaces.ts";

export type ImageSize = { width: number; height: number };
export type ImageBox = { columns: number; rows: number };

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

/** The gallery's model: images at their aspect ratios, with their paths as links. */
export type ImageGallery = {
  images: readonly ImageItem[];
  /** Available terminal columns; the result never exceeds 255. */
  columns: number;
  /** Available terminal rows; the result never exceeds 255. @default 30 */
  rows?: number;
  /** Terminal cell height divided by its width. @default 2 */
  cellRatio?: number;
  /** Optional dim text above the gallery. */
  caption?: string;
};

/**
 * What a gallery needs of a host: `images`, which a graphical client does not give a mod (it
 * shows the image itself), and pi has no terminal image component for. No field is gated, so a
 * terminal draws pi's alt text from the same props.
 */
export const imageNeeds = {} as const;

export const imageFields = modelFields<ImageGallery>()([
  "images",
  "columns",
  "rows",
  "cellRatio",
  "caption",
]);

/** The gallery as `On` surfaces are given it. */
export type ImageGalleryProps<On extends Surface> = Props<ImageGallery, typeof imageNeeds, On>;

/** What `imageGallery` is given on a terminal. */
export type ImageGalleryTerminal = ImageGalleryProps<"pi" | "claude-terminal">;
