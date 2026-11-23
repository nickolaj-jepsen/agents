/** The captioned frame's contract: its model and what each drawing is given. No host imports. */
import type { Button } from "@agents/kit-buttons/contract.ts";
import { modelFields } from "@agents/kit-core/manifest.ts";
import type { Line, Span } from "@agents/kit-core/lines.ts";
import type { Props, Surface } from "@agents/kit-core/surfaces.ts";

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

/** Close at the right edge, or in its place the question that throws the answers away. */
export type Close = {
  confirming?: boolean;
  /** The control under the pointer, for a drawing that has a pointer of its own (a terminal). */
  hover?: CloseAction;
  /** What the question says, where there is room for it. @default "Discard answers?" */
  question?: string;
  /** The key Keep answers to, where Escape never reaches the frame. @default "esc" */
  keep?: string;
};

/**
 * What a drawing is given for the parts that are not data: a terminal's body is `Line[]`, a
 * graphical one's an element, a story's a description the catalogue's adapter turns into either.
 */
export type Slots = {
  body: unknown;
  /** The buttons above the bottom rule: a laid-out `Line`, or `Button[][]` for the kit's view model to decide. */
  footer: unknown;
  notice: unknown;
  /** In place of the caption and the title: the words as an element. */
  head: unknown;
};

/** What a terminal lays out: lines. */
export type TerminalSlots = { body: Line[]; footer: Line; notice: Line; head: never };

/**
 * What a graphical surface is given: an element, or a list of them (groups, each parted from the
 * next by the same space; nulls are left out), and the footer as the model's buttons.
 */
export type GuiSlots<E> = {
  body: E | readonly (E | null | undefined)[];
  footer: readonly (readonly Button[])[];
  notice: readonly Span[];
  head: E;
};

/** What a story describes in place of a body: the catalogue's adapter draws it. */
export type StoryBody = { question: string; label?: string };

/** What a story's footer and notice are: the model's own data. */
export type StorySlots = {
  body: StoryBody;
  footer: readonly (readonly Button[])[];
  notice: readonly Span[];
  head: never;
};

/**
 * The frame's model: what a screen of it says. A frame is a head (a title, a caption, Close), a
 * body, a notice and the buttons.
 * @typeParam S How the body, the footer, the notice and the head are given.
 */
export type Frame<S extends Slots> = {
  /** Bold accent words in the top rule; on a graphical surface the heading, left out where the host draws it. */
  title: string;
  /** In place of the title: the words of the head. */
  caption?: readonly Span[];
  /** A control at the end of a section's heading (`captionRule`). */
  end?: readonly Span[];
  close?: Close;
  body: S["body"];
  /** The buttons above the bottom rule. */
  footer?: S["footer"];
  /** Takes the blank row above the buttons. */
  notice?: S["notice"];
  /** The frame's outer width in cells, padding included. */
  width: number;
  /** The pane's own title as the host draws it above the body: a title that repeats it is left out. */
  hostTitle?: string;
  /** The words as elements, such as a card's steps as Buttons. */
  head?: S["head"];
  /**
   * Buttons at the head's far edge, after Close's question: the pane's own action, where a long
   * body scrolls and a footer would be out of sight. Only the lit one is filled.
   */
  actions?: readonly Button[];
};

/** The capability each gated field needs. The rest of the model is for every surface. */
export const frameNeeds = {
  width: "cells",
  hostTitle: "cells:false",
  head: "cells:false",
  actions: "cells:false",
} as const;

export const frameFields = modelFields<Frame<Slots>>()([
  "title",
  "caption",
  "end",
  "close",
  "body",
  "footer",
  "notice",
  "width",
  "hostTitle",
  "head",
  "actions",
]);

/** The frame as `S` surfaces are given it: a field a surface cannot draw is not in its type. */
export type FrameProps<S extends Slots, On extends Surface> = Props<
  Frame<S>,
  typeof frameNeeds,
  On
>;

/** What `captionFrame` is given on a terminal; a caption may be drawn in the room the rule has. */
export type CaptionFrame = Omit<
  FrameProps<TerminalSlots, "pi" | "claude-terminal">,
  "caption" | "end"
> & {
  /** Spans, or what draws them in the room the rule has. */
  caption?: readonly Span[] | ((width: number) => Span[] | undefined);
};
