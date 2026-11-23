/** The button row's contract: its model and what each drawing is given. No host imports. */
import { modelFields } from "@agents/kit-core/manifest.ts";
import type { Span } from "@agents/kit-core/lines.ts";
import type { Props, Surface } from "@agents/kit-core/surfaces.ts";

export type Button = {
  /** Key or key range, without brackets. The caller owns the binding. Empty where only a press reaches it. */
  hotkey: string;
  label: string;
  /**
   * The label is a word to insert, not words of the interface: a graphical surface keeps its case
   * rather than capitalising it. A terminal never does.
   */
  isLiteral?: boolean;
  /** The control it is. Without one it is a dim, keyboard-only hint: its key, then what it does. */
  hit?: string;
  /** The suggested action. At most one button of a screen is lit: the first wins (`settle`). */
  isLit?: boolean;
  /** Kept when a single row has to drop entries. */
  essential?: boolean;
  /** Under the pointer: bold, as `hover` in the row's options makes it. */
  hovered?: boolean;
  /**
   * Dim until the pointer is on it: a control beside what it acts on, such as a group's, or one
   * with nothing to do now.
   */
  isQuiet?: boolean;
  /**
   * What the screen is set to, among buttons that set it (`Apply`, `Dismiss`): a graphical
   * surface draws it with a check before its label and never filled, since only the suggested
   * action is and a Button that is not dim is filled there. A terminal draws it as any other.
   */
  isChosen?: boolean;
};

/**
 * The model: the buttons of one screen's footer, a row each, and what decides them. The kit's
 * view model (`view` in `model.ts`) says which is lit, which goes quiet and which are drawn.
 */
export type Buttons = {
  /** The rows, top to bottom; each begins at the same left edge. */
  rows: readonly (readonly Button[])[];
  /** Words before the first entry, such as progress: not a control. */
  lead?: readonly Span[];
  /**
   * Close is asking whether to throw the work away: nothing is lit and every control goes quiet,
   * so the question is what the screen is about.
   */
  confirming?: boolean;
  /** Wrap whole entries instead of dropping the less important ones. @default false */
  wrap?: boolean;
  /** The cell under the pointer, in the returned rows. */
  hover?: { x: number; y: number };
  /**
   * No inset of its own: the row sits in a block that has one, such as a panel. A graphical
   * surface only; a terminal's row has the width it is given.
   */
  isFlush?: boolean;
};

/** The capability each gated field needs. The rest of the model is for every surface. */
export const buttonsNeeds = {
  wrap: "cells",
  hover: "hover:kit|painter",
  isFlush: "cells:false",
} as const;

export const buttonsFields = modelFields<Buttons>()([
  "rows",
  "lead",
  "confirming",
  "wrap",
  "hover",
  "isFlush",
]);

export type ButtonsProps<S extends Surface> = Props<Buttons, typeof buttonsNeeds, S>;

/** What a terminal's row is given besides the cells it has: `buttonRow(keys, width, options)`. */
export type ButtonRowOptions = Pick<ButtonsProps<"pi" | "claude-terminal">, "wrap" | "hover"> & {
  /** Words before the first entry, such as progress: not a control. */
  lead?: Span[];
};
