/** The status band's contract: the one line above the prompt that says there is something to open. No host imports. */
import type { MeaningName } from "@agents/kit-core/icons.ts";
import { modelFields } from "@agents/kit-core/manifest.ts";
import type { Props, Surface } from "@agents/kit-core/surfaces.ts";

export type StatusBandStatus = "warning" | "error" | "success";

/** A further action beside the way in. */
export type StatusBandAction = {
  /** The control it is. */
  hit: string;
  label: string;
};

/**
 * The band's model: what there is to open, and the way in.
 */
export type StatusBand = {
  /** What there is: the line's words, short enough for a terminal's row. */
  text: string;
  /** What pressing the line does, `review`. */
  hint: string;
  /** The way in: the control the whole line is in a terminal, and the `hint` button elsewhere. */
  hit: string;
  /** Colours the mark and, in a terminal, the text. Only for an actual state. @default "warning" */
  status?: StatusBandStatus;
  /** The room in cells. */
  width: number;
  /** The keyboard's focus is on the line, which a terminal says with bold words. */
  hovered?: boolean;
  /**
   * Further actions after the way in, as quiet buttons. A terminal's band is one line that is
   * one control, so it does not draw them: the mod offers them as keys there.
   */
  actions?: readonly StatusBandAction[];
  /** The text in words rather than the terminal's shorthand. @default the band's `text` */
  words?: string;
  /** Replaces the status's own mark: what the line is about (`field:draft`, `state:question`). */
  mark?: MeaningName;
  /**
   * Everything on one line: the text cut at the edge by the surface, every button after it.
   * For a line that names something already known, not news to read whole. Otherwise, with
   * further actions, the buttons wrap under the text.
   */
  isOneLine?: boolean;
};

/** The capability each gated field needs. The rest of the model is for every surface. */
export const statusBandNeeds = {
  width: "cells",
  hovered: "keyFocus:kit|ring",
  actions: "cells:false",
  words: "cells:false",
  mark: "cells:false",
  isOneLine: "cells:false",
} as const;

export const statusBandFields = modelFields<StatusBand>()([
  "text",
  "hint",
  "hit",
  "status",
  "width",
  "hovered",
  "actions",
  "words",
  "mark",
  "isOneLine",
]);

/** The band as `On` surfaces are given it: a field a surface cannot draw is not in its type. */
export type StatusBandProps<On extends Surface> = Props<StatusBand, typeof statusBandNeeds, On>;

/** What `statusBand` is given on a terminal. */
export type StatusBandTerminal = StatusBandProps<"pi" | "claude-terminal">;
