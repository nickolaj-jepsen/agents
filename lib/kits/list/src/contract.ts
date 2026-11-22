/** The list's contract: rows of a line or two each under group rows, behind rails. No host imports. */
import type { Button } from "@agents/kit-buttons/contract.ts";

/**
 * What a row is set to: left alone (`○`), chosen (`●`, in the accent) or set aside (`–`, the
 * whole row dim). `none` draws no mark, for a menu of actions that is not set to anything: where
 * every row says it, the list keeps no cell for the mark.
 */
export type ListMark = "open" | "chosen" | "dropped" | "none";

export type ListRow = {
  /** Inline Markdown, cut to one row, or wrapped to the list's `lines`; unless `literal`. */
  text: string;
  /** The text is a name or a path, not Markdown: its `_` and `*` are letters. */
  literal?: boolean;
  /** @default "open" */
  mark?: ListMark;
  /** Dim words in the list's aside column at the right, such as a count. */
  aside?: string;
  /** The keyboard's row: a neutral bold pointer and a bold label. */
  focused?: boolean;
  /** The row under the mouse: bold as the keyboard's is, without the pointer. */
  hovered?: boolean;
  /**
   * A key drawn before the row's mark, dim and in the accent in the group the keyboard is in, as
   * a card's letters are; the widest in the list sets its column. The caller owns the binding.
   * Terminal only: a graphical surface draws no key.
   */
  key?: string;
  /**
   * The row cannot be used now: its words and aside are dim and it is no control, with no `hit`
   * nor `markHit`. Its text says why, or its aside.
   */
  disabled?: boolean;
  /** The control the row's text is. */
  hit?: string;
  /**
   * The word on the quiet Button a graphical surface draws for `hit`, where rows of one list do
   * different things (`Open`, `Copy`): a Button never wraps, so the text sits beside it and the
   * Button names what pressing does. Else the list's own (`action` of its gui options).
   * Terminal: not drawn; the row is the control.
   */
  action?: string;
  /** The control its pointer column and mark are, apart from its text: a click there steps the mark: open, chosen, dropped, and round to open. */
  markHit?: string;
};

export type ListGroup = {
  /**
   * A path or a name. A long one is cut from the left, since a path is read from its end. A
   * group with none draws no group row: its rows are the whole list, such as a menu's.
   */
  label: string;
  /** The keyboard is in this group: its rail is bright and its label in the accent. */
  active?: boolean;
  /** Every row of the group is decided: its rail is in the success colour. */
  done?: boolean;
  rows: ListRow[];
  /** The control the group's label is. */
  hit?: string;
  /** Controls at the right of the group's row, quiet until the pointer is on one; no key is shown. */
  actions?: Button[];
};

export type List = {
  groups: ListGroup[];
  /**
   * Rows the list may take. A taller list is a window from `top`; its last row says how many
   * rows are above and below, and the keyboard's group row stands in for its first row when it
   * is above it.
   */
  height?: number;
  /** The window's first line, as a line of the list drawn whole at its width. @default 0 */
  top?: number;
  /** Cells of the aside column every row keeps at its right, blank where a row has none. */
  aside?: number;
  /**
   * Rows a row's text may take: a longer one wraps under its first line, and the last line of a
   * cut one ends in `…`. A flat list keeps one. @default 1
   */
  lines?: number;
  /** Each row carries its group's label, dim, instead of rows under group rows: for little room. */
  flat?: boolean;
  /** A blank row between groups, without a rail: a line of the list, which a window scrolls past. */
  space?: boolean;
  /**
   * False for no rails, nor the cells they take: a group's label starts the row, and nothing
   * says whether a group is decided. For a list that is not a form to complete. @default true
   */
  rail?: boolean;
};
