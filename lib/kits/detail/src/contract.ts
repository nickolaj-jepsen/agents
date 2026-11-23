/** The detail's contract: one item read whole, cut to a height. No host imports. */
import type { Button } from "@agents/kit-buttons/contract.ts";
import { modelFields } from "@agents/kit-core/manifest.ts";
import type { Props, Surface } from "@agents/kit-core/surfaces.ts";

/** A row of what an item points at: a dim key, and the value hanging beside it. */
export type DetailItem = {
  key: string;
  value: string;
  /** Words someone wrote, set in quotation marks. */
  isQuote?: boolean;
};

export type DetailSection = {
  /**
   * A rule across the top of the section, these dim words at its start: between pieces. Several
   * are set apart by a short rule, as the parts of a frame's caption are.
   */
  rule?: string | readonly string[];
  /** A control at the rule's end, label first with its key dim after it. */
  action?: Button;
  /** A dim heading over the section. */
  heading?: string;
  /** Markdown, set as `prose` sets it. */
  text?: string;
  /** Keyed rows: what the item points at, drawn as `fields` without keys. */
  items?: DetailItem[];
};

export type Detail = {
  /** A dim line over the title: what kind of item, how often, how old. */
  meta?: string;
  /** Inline Markdown, bold and wrapped. */
  title?: string;
  /** Rows the title may take; the last of a cut one ends in `…`. */
  titleMax?: number;
  sections?: DetailSection[];
  /** Rows it may take: a longer detail is cut, and a dim `↓ more` says so. */
  height?: number;
  /** Rows scrolled past at the top; a dim `↑ more` says so. */
  offset?: number;
  /**
   * Its rules run the whole width, as a frame's top rule does with its corner after the control,
   * and every other row is set in on both sides to line up with their words: for a detail that
   * stands in a frame's body, drawn at the frame's width.
   */
  framed?: boolean;
  /** The control every row is, but a rule's that holds an action. */
  hit?: string;
  /** Under the mouse: the meta line is bold. */
  hovered?: boolean;
  /**
   * The word on the quiet Button the detail's `hit` is: a Button never wraps, so the word names
   * what pressing does. @default "Open"
   */
  action?: string;
  /**
   * That Button on the first row (the meta line, or the title without one) at the far edge, as a
   * caption rule's control is, instead of a row of its own under the title.
   */
  isActionAtEdge?: boolean;
  /** No inset of its own: it sits in a panel or another block that has one. */
  isFlush?: boolean;
};

/** The capability each gated field needs. The rest of the model is for every surface. */
export const detailNeeds = {
  titleMax: "cells",
  height: "window",
  offset: "window",
  framed: "cells",
  hovered: "hover:kit|painter",
  action: "cells:false",
  isActionAtEdge: "cells:false",
  isFlush: "cells:false",
} as const;

export const detailFields = modelFields<Detail>()([
  "meta",
  "title",
  "titleMax",
  "sections",
  "height",
  "offset",
  "framed",
  "hit",
  "hovered",
  "action",
  "isActionAtEdge",
  "isFlush",
]);

/** The detail as `S` surfaces are given it: a field a surface cannot draw is not in its type. */
export type DetailProps<S extends Surface> = Props<Detail, typeof detailNeeds, S>;
