/**
 * The vocabulary the frame's two lines share: one part of a row, and where on the row a control
 * sits. The footer and the editor's top border are both a row of parts painted into a width, with
 * the regions a pointer and a click are read against, so the words and the hit-testing live here
 * once instead of in each row.
 */
import { cellWidth, type Role, type Span } from "@agents/kit-core/lines.ts";

/**
 * One thing a row says. `text` is what it reads as plain, and its width; `spans` is how it is
 * painted when that is more than one colour. `action` names what a click does, and a part with one
 * is a control; `short` is what it says when the row is squeezed.
 */
export type Part = {
  id: string;
  text: string;
  spans?: Span[];
  role?: Role;
  bold?: boolean;
  short?: string;
  /** Columns of extra click target on each side; neighbours split any overlap. */
  hitPad?: number;
  action?: string;
};

/** Where a control sits on the painted row, in cells from its start. */
export type Region = { x0: number; x1: number; id: string; action: string };

/** The spans a part draws, with its own style when it gives no spans of its own. */
export const spansOf = (part: Part): Span[] =>
  part.spans && part.spans.map((s) => s.text).join("") === part.text
    ? part.spans
    : [{ text: part.text, role: part.role, bold: part.bold }];

/** What a part reads as when the row is squeezed, and whether that is a shorter form. */
export const shownText = (part: Part, short: boolean): string =>
  short ? (part.short ?? part.text) : part.text;

/** The control at cell `x`, if a row has one there. */
export const regionAt = (regions: readonly Region[], x: number) => {
  for (const region of regions) if (x >= region.x0 && x < region.x1) return region;
  return undefined;
};

/**
 * A padded target must not swallow its neighbour: two that overlap split the gap between them, so
 * a click near the edge of a row still picks the control it is closest to.
 */
export const splitOverlaps = (regions: Region[]): Region[] => {
  for (let i = 1; i < regions.length; i++) {
    const left = regions[i - 1];
    const right = regions[i];
    if (left && right && left.x1 > right.x0) {
      const middle = Math.floor((left.x1 + right.x0) / 2);
      left.x1 = middle;
      right.x0 = middle;
    }
  }
  return regions;
};

/** Cells `parts` take, with the gap between each two. */
export const partsWidth = (parts: readonly Part[], gap = 2) =>
  parts.reduce((sum, part, i) => sum + (i === 0 ? 0 : gap) + cellWidth(part.text), 0);
