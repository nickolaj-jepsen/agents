/**
 * The captioned frame on the graphical surfaces. The host frames a pane and owns its Close, so
 * there are no rules and no edges: the frame's top is a toolbar line, its body a column.
 *
 * The body and the footer are laid out for cells in the contract (`Line[]`); here they are
 * elements, in the options of `captionFrame`, drawn with the kit's own `gui.tsx` functions.
 */
import { buttonRow } from "@agents/kit-buttons/gui.tsx";
import type { Button } from "@agents/kit-buttons/contract.ts";
import type { Gui } from "@agents/kit-core/paint/gui.tsx";
import { capital, spans } from "@agents/kit-core/paint/gui.tsx";
import type { Span } from "@agents/kit-core/lines.ts";
import { tokens } from "@agents/kit-core/tokens.ts";
import { closeHit, type CaptionFrame } from "./contract.ts";

/** What only a graphical host can say about the frame's head. */
export type FrameHeadOptions = {
  /** The pane's own title as the host draws it above the body: the frame leaves a title that repeats it out. */
  hostTitle?: string;
  /** In place of `caption` and the title: the words as elements, such as a card's steps as Buttons. */
  head?: JSX.Element;
  /**
   * Buttons at the toolbar's far edge, after Close's question: the pane's own action, where a long
   * body scrolls and a footer would be out of sight. Only the lit one is filled.
   */
  actions?: readonly Button[];
};

export type FrameOptions = FrameHeadOptions & {
  /** The body, drawn by the kit's gui functions in place of `Line[]`. */
  body: JSX.Element;
  /** The footer's buttons, drawn by `buttonRow`; none is lit while `close.confirming`. */
  footer?: readonly Button[];
};

/** `CaptionFrame` without what a graphical host lays out itself or takes as elements. */
export type FrameGui = Omit<CaptionFrame, "width" | "body" | "footer">;

/**
 * Close's question, once it asks: the words and a Button each for Discard and Keep, both quiet
 * as the terminal draws them. Close itself is the host's, so it is not drawn while nothing is
 * asked.
 */
export function closeRow(g: Gui, close: CaptionFrame["close"]): JSX.Element | null {
  const { Box, Button, Text } = g.els;
  if (!close?.confirming) return null;
  return (
    <Box
      flexDirection="row"
      flexWrap="wrap"
      alignItems="center"
      columnGap={tokens.gui.across.xs}
      rowGap={tokens.gui.space.xs}
    >
      <Text color="warning">{close.question ?? "Discard answers?"}</Text>
      <Button label={capital("discard")} dimColor onPress={() => g.press?.(closeHit("discard"))} />
      <Button label={capital("keep")} dimColor onPress={() => g.press?.(closeHit("keep"))} />
    </Box>
  );
}

/** The words of a head: its caption, or its title unless it repeats the host's. */
function words(g: Gui, f: Pick<FrameGui, "title" | "caption">, o: FrameHeadOptions) {
  const { Text } = g.els;
  if (o.head) return o.head;
  const caption = typeof f.caption === "function" ? f.caption(Infinity) : f.caption;
  if (caption?.length) return spans(g, caption);
  if (!f.title || f.title === o.hostTitle) return null;
  return <Text weight="semibold">{f.title}</Text>;
}

/** The toolbar line both heads are: words at the start, Close's question at the far edge. */
export function head(
  g: Gui,
  f: Pick<FrameGui, "title" | "caption" | "close">,
  options: FrameHeadOptions = {},
): JSX.Element | null {
  const { Box, Button } = g.els;
  const left = words(g, f, options);
  const asked = closeRow(g, f.close);
  const acts = (options.actions ?? []).filter((b) => b.hit !== undefined);
  if (!left && !asked && acts.length === 0) return null;
  const right =
    asked || acts.length > 0 ? (
      <Box
        flexDirection="row"
        flexWrap="wrap"
        alignItems="center"
        columnGap={tokens.gui.across.xs}
        rowGap={tokens.gui.space.xs}
      >
        {asked}
        {f.close?.confirming
          ? null
          : acts.map((b) => (
              <Button
                key={b.hit}
                variant={b.isLit ? "primary" : undefined}
                dimColor={!b.isLit || undefined}
                label={capital(b.label)}
                onPress={() => g.press?.(b.hit as string)}
              />
            ))}
      </Box>
    ) : null;
  return (
    <Box
      flexDirection="row"
      flexWrap="wrap"
      alignItems="center"
      justifyContent="space-between"
      columnGap={tokens.gui.across.md}
      rowGap={tokens.gui.space.xs}
      paddingX={tokens.gui.across.inset}
    >
      {left}
      {right}
    </Box>
  );
}

/**
 * A frame's top: the pane's toolbar line. Its title is semibold and left out where it repeats
 * `hostTitle`; a `caption` replaces it, drawn in its own roles. Close is the host's, so it
 * appears only as the question it asks, with Discard and Keep.
 */
export function frameTop(
  g: Gui,
  f: Pick<FrameGui, "title" | "caption" | "close">,
  options: FrameHeadOptions = {},
): JSX.Element | null {
  return head(g, f, options);
}

/** A footer's buttons, quiet while Close asks: the question is what the frame is about. */
export function footerRow(g: Gui, buttons: readonly Button[] | undefined, confirming?: boolean) {
  if (!buttons?.length) return null;
  return buttonRow(g, confirming ? buttons.map((b) => ({ ...b, isLit: false })) : buttons);
}

/** A notice's row: its spans at the inset. */
export function noticeRow(g: Gui, notice: { spans: readonly Span[] } | undefined) {
  const { Box } = g.els;
  if (!notice?.spans.length) return null;
  return <Box paddingX={tokens.gui.across.inset}>{spans(g, notice.spans)}</Box>;
}

/** `a ── b`: the parts of a caption, a short dim rule between two, as the terminal sets them. */
export const captionParts = (_g: Gui, parts: readonly Span[][]): Span[] =>
  parts
    .filter((part) => part.length)
    .flatMap((part, i) =>
      i
        ? [{ text: ` ${tokens.glyph.rule.repeat(tokens.gutter)} `, role: "dim" as const }, ...part]
        : part,
    );

/**
 * A section's heading: its caption words at the start and its control at the far edge, which is
 * a quiet Button for the span that has a `hit` (the words of one without are text). No rule is
 * drawn: a drawn line is not the surface's, and the heading reads as one without.
 * @param tail Cells of rule after the control: a terminal's corner, nothing here.
 */
export function captionRule(
  g: Gui,
  { caption = [], end = [] }: { caption?: Span[]; end?: Span[]; tail?: number },
): JSX.Element | null {
  const { Box, Button, Text } = g.els;
  if (!caption.length && !end.length) return null;
  const hit = end.find((s) => s.hit !== undefined)?.hit;
  const label = end
    .map((s) => s.text)
    .join("")
    .trim();
  return (
    <Box
      flexDirection="row"
      flexWrap="wrap"
      alignItems="center"
      justifyContent="space-between"
      columnGap={tokens.gui.across.md}
      rowGap={tokens.gui.space.xs}
      paddingX={tokens.gui.across.inset}
    >
      {caption.length
        ? spans(
            g,
            caption.map((s) => (s.bold ? s : { ...s, role: s.role ?? "dim" })),
          )
        : null}
      {hit !== undefined ? (
        <Button label={capital(label)} dimColor onPress={() => g.press?.(hit)} />
      ) : label ? (
        <Text dimColor>{label}</Text>
      ) : null}
    </Box>
  );
}

/**
 * An inline form: its head, its body, a notice and its footer in a column, a space between.
 * @param options `body` and `footer` are elements; see `FrameOptions`.
 */
export function captionFrame(g: Gui, f: FrameGui, options: FrameOptions): JSX.Element {
  const { Box } = g.els;
  return (
    <Box flexDirection="column" rowGap={tokens.gui.space.md}>
      {head(g, f, options)}
      {options.body}
      {noticeRow(g, f.notice)}
      {footerRow(g, options.footer, f.close?.confirming)}
    </Box>
  );
}
