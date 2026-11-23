/** The notice's contract: its model and what each drawing is given. No host imports. */
import type { Span } from "@agents/kit-core/lines.ts";
import { modelFields } from "@agents/kit-core/manifest.ts";
import type { Props, Surface } from "@agents/kit-core/surfaces.ts";

/**
 * What a notice is in: an actual state (success, warning, error, pending), which a graphical
 * surface marks with an icon, or words that are only `dim` (beside the main thing) or `text`.
 */
export type NoticeStatus = "success" | "warning" | "error" | "pending" | "dim" | "text";

/**
 * The notice's model: one line telling the person what just happened, or what a list says when
 * it has no rows.
 */
export type Notice = {
  /** Words, or spans where part of the line stands out; a span with no role takes the status's. */
  text: string | readonly Span[];
  /** Success, warning, error and pending only for an actual state. @default "warning" */
  status?: NoticeStatus;
  /** What a list says when there is nothing in it: caption words, wrapped, with no mark. */
  isEmpty?: boolean;
  /** The room in cells. */
  width: number;
  /** Wrap the whole text instead of cutting it to one line. @default false */
  isWrapped?: boolean;
  /** The text as a graphical surface says it: a fuller sentence, without the terminal's shorthand. */
  words?: string | readonly Span[];
  /** One line, cut at the edge by the surface: a footnote, not news. */
  isCut?: boolean;
};

/** The capability each gated field needs. The rest of the model is for every surface. */
export const noticeNeeds = {
  width: "cells",
  isWrapped: "cells",
  words: "cells:false",
  isCut: "cells:false",
} as const;

export const noticeFields = modelFields<Notice>()([
  "text",
  "status",
  "isEmpty",
  "width",
  "isWrapped",
  "words",
  "isCut",
]);

/** The notice as `On` surfaces are given it: a field a surface cannot draw is not in its type. */
export type NoticeProps<On extends Surface> = Props<Notice, typeof noticeNeeds, On>;

/** What `notice` is given on a terminal. */
export type NoticeTerminal = NoticeProps<"pi" | "claude-terminal">;

/** What `emptyState` is given on `On`: its words, and nothing a state has. */
export type EmptyStateProps<On extends Surface> = Omit<
  NoticeProps<On>,
  "text" | "status" | "isEmpty" | "isWrapped" | "isCut"
> & { text: string };
