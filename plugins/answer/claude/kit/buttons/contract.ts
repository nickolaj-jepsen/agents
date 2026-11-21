/** The button row's contract. No host imports. */
import type { Span } from "../lines.ts";

export type Button = {
  /** Key or key range, without brackets. The caller owns the binding. */
  hotkey: string;
  label: string;
  /** The control it is. Without one it is a dim, keyboard-only hint: its key, then what it does. */
  hit?: string;
  /** The suggested action. */
  isLit?: boolean;
  /** Kept when a single row has to drop entries. */
  essential?: boolean;
};

export type ButtonRowOptions = {
  /** Wrap whole entries instead of dropping the less important ones. @default false */
  wrap?: boolean;
  /** Words before the first entry, such as progress: not a control. */
  lead?: Span[];
  /** The cell under the pointer, in the returned rows. */
  hover?: { x: number; y: number };
};
