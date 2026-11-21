/** The detail's contract: one item read whole, cut to a height. No host imports. */

/** A row of what an item points at: a dim key, and the value hanging beside it. */
export type DetailItem = {
  key: string;
  value: string;
  /** Words someone wrote, set in quotation marks. */
  isQuote?: boolean;
};

/** A control at the end of a section's rule, label first with its key dim after it. */
export type DetailAction = {
  label: string;
  hotkey: string;
  hit: string;
  /** Under the mouse: bold. */
  hovered?: boolean;
};

export type DetailSection = {
  /** A rule across the top of the section, these dim words at its start: between pieces. */
  rule?: string;
  /** A control at the rule's end. */
  action?: DetailAction;
  /** A dim heading over the section. */
  heading?: string;
  /** Prose in inline Markdown; each `\n` starts a line. */
  text?: string;
  /** Keyed rows: what the item points at. */
  items?: DetailItem[];
};

export type Detail = {
  /** A dim line over the title: what kind of item, how often, how old. */
  meta?: string;
  /** Inline Markdown, bold and wrapped. */
  title?: string;
  sections?: DetailSection[];
  /** Rows it may take: a longer detail is cut, and a dim `↓ more` says so. */
  height?: number;
  /** Rows scrolled past at the top; a dim `↑ more` says so. */
  offset?: number;
  /** The control every row is, but a rule's that holds an action. */
  hit?: string;
  /** Under the mouse: the meta line is bold. */
  hovered?: boolean;
};
