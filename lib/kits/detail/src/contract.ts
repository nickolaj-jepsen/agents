/** The detail's contract: one item read whole, cut to a height. No host imports. */
import type { Button } from "../buttons/contract.ts";

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
};
