/**
 * Images as styled lines, for the terminal only: the graphical clients show images themselves.
 * An image is one line with an `image` slot, whose alt text stands in where the client cannot
 * draw one (pi, a terminal without images); its path is `link` lines under it.
 */
import { blank, clamp, line, span, type Line } from "@agents/kit-core/lines.ts";
import type { ImageGalleryTerminal } from "./contract.ts";
import { fileUrl, fitImage } from "./internal.ts";

/**
 * Draws images at their aspect ratios, a blank row between parts, each with its path as a dim
 * link below it. `columns` is the room for the lines too.
 */
export function imageGallery(gallery: ImageGalleryTerminal): Line[] {
  const { images, caption } = gallery;
  const room = Math.max(1, Math.floor(gallery.columns));
  const parts: Line[][] = [];
  if (caption) parts.push(clamp(caption, room).map((row) => line([span(row, { role: "dim" })])));
  for (const image of images) {
    const box = fitImage(image.size, gallery);
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
