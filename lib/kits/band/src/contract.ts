/** The status band's contract: the one line above the prompt that says there is something to open. No host imports. */

export type StatusBandStatus = "warning" | "error" | "success";

/** A further action beside the way in. */
export type StatusBandAction = {
  /** The control it is. */
  hit: string;
  label: string;
};

export type StatusBand = {
  /** What there is: the line's words, short enough for a terminal's row. */
  text: string;
  /** What pressing the line does, `review`. */
  hint: string;
  /** The way in: the control the whole line is in a terminal, and the `hint` button elsewhere. */
  hit: string;
  /** Colours the mark and, in a terminal, the text. Only for an actual state. @default "warning" */
  status?: StatusBandStatus;
  /** The keyboard's focus is on the line, which a terminal says with bold words. */
  hovered?: boolean;
  /**
   * Further actions after the way in, as quiet buttons. A terminal's band is one line that is
   * one control, so it does not draw them: the mod offers them as keys there.
   */
  actions?: readonly StatusBandAction[];
};
