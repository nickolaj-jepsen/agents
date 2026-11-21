/** Prose's contract: a text of several blocks, and the window a room too short shows of it. No host imports. */

export type ProseOptions = {
  /** Every word quiet: a text beside the main one. */
  isDim?: boolean;
};

export type Scroll = {
  /** Rows the window has, its markers included. */
  rows: number;
  /** Lines scrolled past. Read the one that applies back from `Scrolled.top`. */
  top?: number;
  /** The controls its markers are: each steps the window. Without them they are only read. */
  hits?: { up: string; down: string };
};

export type Scrolled<Row> = {
  rows: Row[];
  /** `top` as it applies: within what there is to scroll. */
  top: number;
  /** The furthest `top` goes. Zero when everything shows. */
  max: number;
};
