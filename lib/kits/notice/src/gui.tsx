/** The notice and the empty state on the graphical surfaces: the same contract, in native controls. */
import type { Span } from "@agents/kit-core/lines.ts";
import { icon, roleProps, spans, type Gui, type IconName } from "@agents/kit-core/paint/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { NoticeOptions, NoticeStatus } from "./contract.ts";

/** What only a graphical surface decides about a notice. */
export type NoticeGuiOptions = NoticeOptions & {
  /** One line, cut at the edge by the surface: a footnote, not news. */
  isCut?: boolean;
  /** No inset of its own: it sits in a block that has one, beside the block's controls. */
  isFlush?: boolean;
};

const MARKED: Partial<Record<NoticeStatus, IconName>> = {
  success: "success",
  warning: "warning",
  error: "error",
};

/**
 * One line telling the person what just happened: an icon for a state (success, warning,
 * error) and the text in its role at the inset. The surface wraps it; width is not a prop.
 * @param text Words, or spans where part of the line stands out; a span with no role takes the status's.
 * @param status Success, warning and error only for an actual state. @default "warning"
 */
export function notice(
  g: Gui,
  text: string | readonly Span[],
  status: NoticeStatus = "warning",
  { isCut, isFlush }: NoticeGuiOptions = {},
): JSX.Element {
  const { Box, Text } = g.els;
  const mark = MARKED[status];
  return (
    <Box
      flexDirection="row"
      flexWrap="nowrap"
      alignItems="center"
      columnGap={tokens.gui.across.sm}
      paddingX={isFlush ? undefined : tokens.gui.across.inset}
    >
      {mark
        ? icon(g, mark, { tone: status as "success" | "warning" | "error", alt: status })
        : null}
      <Box flexShrink={1}>
        <Text wrap={isCut ? "truncate-end" : undefined} {...roleProps(status)}>
          {typeof text === "string" ? text : spans(g, text)}
        </Text>
      </Box>
    </Box>
  );
}

/** What only a graphical surface decides about an empty state. */
export type EmptyStateGuiOptions = {
  /** The text as a graphical surface says it: a fuller sentence, without the terminal's shorthand. */
  text?: string;
};

/**
 * What a list says when there is nothing in it: dim, at the inset, wrapped by the surface.
 * @param text Say what is missing and, if it helps, what makes rows appear.
 */
export function emptyState(g: Gui, text: string, options: EmptyStateGuiOptions = {}): JSX.Element {
  const { Box, Text } = g.els;
  return (
    <Box paddingX={tokens.gui.across.inset}>
      <Text dimColor>{options.text ?? text}</Text>
    </Box>
  );
}
