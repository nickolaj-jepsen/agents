/**
 * The captioned frame on the graphical surfaces. The host frames a pane and owns its Close, so
 * there are no rules and no edges: the frame's top is a toolbar line, its body a column.
 *
 * The body and the notice are elements and spans here, in the props of `captionFrame`, drawn with
 * the kit's own `gui.tsx` functions; the footer is the model's `Button[][]`, which the buttons'
 * view model decides: one lit, and every control quiet while Close asks.
 */
import { buttonRow } from "@agents/kit-buttons/gui.tsx";
import { settle } from "@agents/kit-buttons/model.ts";
import type { Gui, GuiSurface } from "@agents/kit-core/paint/gui.tsx";
import {
  meaning,
  panel,
  roleProps,
  rowOf,
  spans,
  typed,
  typeProps,
} from "@agents/kit-core/paint/gui.tsx";
import type { Span } from "@agents/kit-core/lines.ts";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { FrameProps, GuiSlots } from "./contract.ts";
import { view, type FrameModel, type FrameView } from "./model.ts";

/** What `captionFrame` is given on a graphical surface; a field only a terminal has is not in it. */
export type FrameGui = FrameProps<GuiSlots<JSX.Element>, GuiSurface>;

/** What the head alone needs: `frameTop`'s props. */
export type FrameTopGui = Pick<
  FrameGui,
  "title" | "caption" | "close" | "hostTitle" | "head" | "actions"
>;

const asModel = (f: Partial<FrameGui>): FrameModel => ({
  title: f.title ?? "",
  caption: f.caption,
  close: f.close,
  hostTitle: f.hostTitle,
  actions: f.actions,
  footer: f.footer,
  notice: f.notice,
  body: { question: "" },
});

/** Close's question, once it asks, set apart as a panel: it is a warning with its own actions. */
function question(g: Gui, f: FrameTopGui, v: FrameView): JSX.Element {
  const { Box, Button, Text } = g.els;
  return (
    <Box flexDirection="column" paddingX={tokens.gui.across.inset}>
      {panel(
        g,
        { key: "ask" },
        rowOf(
          g,
          {},
          meaning(g, "state:warning"),
          <Text {...typeProps("body")} {...roleProps("warning")}>
            {f.close?.question ?? "Discard answers?"}
          </Text>,
          <Box flexDirection="row" flexWrap="wrap" columnGap={tokens.gui.across.xs}>
            {v.head.question?.rows[0]?.map((b) => (
              <Button
                key={b.hit}
                dimColor
                label={b.label}
                onPress={() => g.press(b.hit as string)}
              />
            ))}
          </Box>,
        ),
      )}
    </Box>
  );
}

/** The toolbar line both heads are: the words at the start, the pane's own actions at the far edge. */
function head(g: Gui, f: FrameTopGui, v: FrameView): JSX.Element | null {
  const { Box, Button } = g.els;
  if (v.head.close === "question") return question(g, f, v);
  const words =
    f.head ??
    (v.head.title || v.head.caption ? (
      <Box flexDirection="column" rowGap={tokens.gui.space.xs}>
        {v.head.title ? typed(g, "heading", v.head.title) : null}
        {v.head.caption ? spans(g, f.caption ?? [], { type: "caption" }) : null}
      </Box>
    ) : null);
  const acts = v.head.actions?.rows[0] ?? [];
  if (!words && acts.length === 0) return null;
  return (
    <Box
      flexDirection="row"
      flexWrap="wrap"
      alignItems="center"
      justifyContent="space-between"
      columnGap={tokens.gui.across.md}
      rowGap={tokens.gui.space.xs}
      paddingX={tokens.gui.across.inset}
      paddingY={tokens.gui.row.pad}
    >
      {words}
      {acts.length ? (
        <Box
          flexDirection="row"
          flexWrap="wrap"
          alignItems="center"
          columnGap={tokens.gui.across.xs}
        >
          {acts.map((b) => (
            <Button
              key={b.hit}
              variant={b.tone === "lit" ? "primary" : undefined}
              dimColor={b.tone !== "lit" || undefined}
              label={b.label}
              onPress={() => g.press(b.hit as string)}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

/** A notice's row: an icon for the state its words are in, then the words. */
function notice(g: Gui, words: readonly Span[] | undefined): JSX.Element | null {
  const { Box } = g.els;
  if (!words?.length) return null;
  const role = words[0]?.role;
  const state = role === "warning" ? "state:warning" : role === "error" ? "state:error" : undefined;
  return (
    <Box paddingX={tokens.gui.across.inset}>
      {rowOf(
        g,
        {},
        state ? meaning(g, state) : null,
        spans(g, words, { type: state ? "body" : "caption" }),
      )}
    </Box>
  );
}

/**
 * A frame's top: the pane's toolbar line. Its title is the `heading` and left out where it
 * repeats `hostTitle`; a `caption` follows it as a `caption`. Close is the host's, so it appears
 * only as the question it asks, with Discard and Keep.
 */
export function frameTop(g: Gui, f: FrameTopGui): JSX.Element | null {
  return head(g, f, view(asModel(f), g.surface));
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
 * A section's heading: its caption words at the start, in the `section` role (a dim part in
 * `caption`), and its control at the far edge, which is a quiet Button for the span that has a
 * `hit` (the words of one without are text). No rule is drawn: a drawn line is not the surface's,
 * and the heading reads as one without.
 */
export function captionRule(
  g: Gui,
  { caption = [], end = [] }: Pick<FrameGui, "caption" | "end">,
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
      paddingY={tokens.gui.row.pad}
    >
      {caption.length ? (
        <Box
          flexDirection="row"
          flexWrap="wrap"
          alignItems="center"
          columnGap={tokens.gui.across.sm}
        >
          {caption.map((s, i) =>
            typed(g, s.bold ? "section" : "caption", s.text.trim(), { key: `c${i}` }),
          )}
        </Box>
      ) : null}
      {hit !== undefined ? (
        <Button label={label} dimColor onPress={() => g.press(hit)} />
      ) : label ? (
        <Text {...typeProps("caption")}>{label}</Text>
      ) : null}
    </Box>
  );
}

/**
 * An inline form: its head, its body, a notice and its footer in a column, a space between. The
 * footer's buttons are the model's rows, decided by the buttons' view model.
 */
export function captionFrame(g: Gui, f: FrameGui): JSX.Element {
  const { Box } = g.els;
  const v = view(asModel(f), g.surface);
  // The head's actions come first, so a lit one there quiets the footer's (one lit per screen).
  const [, ...footer] = settle([f.actions ?? [], ...(f.footer ?? [])], !!f.close?.confirming);
  return (
    <Box flexDirection="column" rowGap={tokens.gui.space.md}>
      {head(g, f, v)}
      {Array.isArray(f.body) ? f.body.filter(Boolean) : f.body}
      {notice(g, f.notice)}
      {buttonRow(g, { rows: footer, confirming: !!f.close?.confirming })}
    </Box>
  );
}
