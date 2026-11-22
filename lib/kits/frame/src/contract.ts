/** The captioned frame's contract. No host imports. */
import type { Line, Span } from "@agents/kit-core/lines.ts";

/** What the frame's own controls do: `close`, or the answer to its question once it asks. */
export type CloseAction = "close" | "discard" | "keep";

/** The control a close action is, as a drawn span's `hit`. */
export const closeHit = (action: CloseAction) => `frame:${action}`;

/** The close action a `hit` names. */
export const closeOf = (hit: string | undefined): CloseAction | undefined =>
  hit === "frame:close" || hit === "frame:discard" || hit === "frame:keep"
    ? (hit.slice(6) as CloseAction)
    : undefined;

/** Where the frame puts its body, and the rows it takes besides. */
export const captionFrameLayout = {
  /** Cells and rows from the frame's corner to the body's. */
  x: 2,
  y: 2,
  /** Rows of the frame, its notice and its buttons. */
  chrome: 5,
  /** Cells of the top rule the caption may not take. */
  reserved: 5,
} as const;

export type CaptionFrame = {
  /** The frame's outer width in cells, padding included. */
  width: number;
  /** Bold accent words in the top rule. */
  title: string;
  /** In place of the title: spans, or what draws them in the room the rule has. */
  caption?: Span[] | ((width: number) => Span[] | undefined);
  /** Close at the right edge, or in its place the question that throws the answers away. */
  close?: {
    confirming?: boolean;
    hover?: CloseAction;
    /** What the question says, where there is room for it. @default "Discard answers?" */
    question?: string;
    /** The key Keep answers to, where Escape never reaches the frame. @default "esc" */
    keep?: string;
  };
  /** Lines laid out for `width - 2 * captionFrameLayout.x` cells. */
  body: Line[];
  /** A button row above the bottom rule. */
  footer?: Line;
  /** Takes the blank row above the buttons. */
  notice?: Line;
};
