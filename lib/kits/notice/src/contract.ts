/** The notice's contract. No host imports. */

/**
 * The colour role of a notice: success, warning and error only for an actual state, dim for
 * what is beside the main thing.
 */
export type NoticeStatus = "success" | "warning" | "error" | "dim" | "text";

export type NoticeOptions = {
  /** Wrap the whole text instead of cutting it to one line. @default false */
  isWrapped?: boolean;
};
