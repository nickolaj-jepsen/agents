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
  /** Dim words at the row's right edge, such as a count: the first thing a narrow row drops. */
  aside?: string;
  /** The keyboard's row: a neutral bold pointer and a bold label. */
  focused?: boolean;
  /** The row under the mouse: bold as the keyboard's is, without the pointer. */
  hovered?: boolean;
  /** The control the row is. */
  hit?: string;
};

export type ListGroup = {
  /** A path or a name. A long one is cut from the left, since a path is read from its end. */
  label: string;
  /** Dim words at the right of the group's row: how many rows it holds. */
  count?: string;
  /** The keyboard is in this group: its rail is bright and its label in the accent. */
  active?: boolean;
  /** Every row of the group is decided: its rail is in the success colour. */
  done?: boolean;
  rows: ListRow[];
  /** The control the group's row is. */
  hit?: string;
};

export type List = {
  groups: ListGroup[];
  /**
   * Rows the list may take. A taller list is a window: the keyboard's group row stays at its
   * top, and the last row says what is hidden. Without it the list is drawn whole.
   */
  height?: number;
  /** Rows the window is moved down from where the keyboard puts it, up when negative: a wheel. */
  scroll?: number;
  /** What a group is called on the row that says what is hidden. @default ["group", "groups"] */
  noun?: readonly [one: string, many: string];
};

/** How far a window's `scroll` can go each way; both 0 for a list drawn whole. */
export type ListRange = { min: number; max: number };
