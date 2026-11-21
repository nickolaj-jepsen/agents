/** The list's contract: rows of one line each under group rows, behind rails. No host imports. */

/**
 * What a row is set to: left alone (`○`), chosen (`●`, in the accent) or set aside (`–`, the
 * whole row dim).
 */
export type ListMark = "open" | "chosen" | "dropped";

export type ListRow = {
  /** Inline Markdown, cut to one row. */
  text: string;
  /** @default "open" */
  mark?: ListMark;
  /** Dim words in the list's aside column at the right, such as a count. */
  aside?: string;
  /** The keyboard's row: a neutral bold pointer and a bold label. */
  focused?: boolean;
  /** The row under the mouse: bold as the keyboard's is, without the pointer. */
  hovered?: boolean;
  /** The control the row's text is. */
  hit?: string;
  /** The control its pointer column and mark are, apart from its text: a click there steps the mark. */
  markHit?: string;
};

/** A dim control at the right of a group's row, bold under the mouse. */
export type ListAction = { label: string; hit: string; hovered?: boolean };

export type ListGroup = {
  /** A path or a name. A long one is cut from the left, since a path is read from its end. */
  label: string;
  /** The keyboard is in this group: its rail is bright and its label in the accent. */
  active?: boolean;
  /** Every row of the group is decided: its rail is in the success colour. */
  done?: boolean;
  rows: ListRow[];
  /** The control the group's label is. */
  hit?: string;
  /** Controls at the right of the group's row. */
  actions?: ListAction[];
};

export type List = {
  groups: ListGroup[];
  /**
   * Rows the list may take. A taller list is a window from `top`; its last row says what is
   * hidden, and the keyboard's group row stands in for its first row when it is above it.
   */
  height?: number;
  /** The window's first line, as a line of the list drawn whole. @default 0 */
  top?: number;
  /** What a group is called on the row that says what is hidden. @default ["group", "groups"] */
  noun?: readonly [one: string, many: string];
  /** Cells of the aside column every row keeps at its right, blank where a row has none. */
  aside?: number;
  /** Each row carries its group's label, dim, instead of rows under group rows: for little room. */
  flat?: boolean;
  /**
   * A blank row between groups, without a rail, when the whole list and those rows fit `height`:
   * whether they show depends on the list's size and the height alone, not on where the keyboard is.
   */
  space?: boolean;
};
