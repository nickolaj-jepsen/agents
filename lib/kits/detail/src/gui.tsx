/**
 * The detail on the graphical surfaces: a meta caption, a heading, and sections whose headings
 * take the `section` role, with text and keyed items in an aligned two-column block.
 */
import { inline } from "@agents/kit-core/lines.ts";
import {
  hasHeadingGap,
  rowOf,
  typed,
  typedSpans,
  type Gui,
  type GuiSurface,
} from "@agents/kit-core/paint/gui.tsx";
import { capital } from "@agents/kit-buttons/model.ts";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { DetailItem, DetailProps, DetailSection } from "./contract.ts";

const { across, space } = tokens.gui;

/** A section's heading: its words in the `section` role, its action at the far edge as a quiet Button. */
function headingOf(g: Gui, s: DetailSection, key: string): JSX.Element | null {
  const { Box, Button } = g.els;
  const parts = (typeof s.rule === "string" ? [s.rule] : (s.rule ?? [])).filter(Boolean);
  const words = parts.length ? parts.join("  ·  ") : (s.heading ?? "");
  const action = s.action?.hit === undefined ? undefined : s.action;
  if (!words && !action) return null;
  return rowOf(
    g,
    { key, justify: "space-between" },
    words ? (
      <Box key="words" flexShrink={1}>
        {typed(g, "section", words)}
      </Box>
    ) : null,
    action ? (
      <Box key="action" flexShrink={0}>
        <Button
          key={action.hit}
          dimColor
          label={capital(action.label)}
          onPress={() => g.press(action.hit!)}
        />
      </Box>
    ) : null,
  );
}

/** Keyed items: a fixed label column and the values, aligned; a quote stays italic. */
function itemsOf(g: Gui, items: readonly DetailItem[], key: string): JSX.Element {
  const { Box, Text } = g.els;
  return (
    <Box key={key} flexDirection="column" rowGap={tokens.gui.row.gap}>
      {items.map((item, i) => (
        <Box key={`${key}:${i}`} flexDirection="row" flexWrap="nowrap" columnGap={across.md}>
          <Box flexShrink={0} minWidth={tokens.gui.labelColumn}>
            <Text dimColor>{item.key}</Text>
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text italic={item.isQuote || undefined}>
              {item.isQuote ? `“${item.value}”` : item.value}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function sectionOf(g: Gui, s: DetailSection, i: number): JSX.Element {
  const { Box, Markdown } = g.els;
  const head = headingOf(g, s, `s${i}:head`);
  return (
    <Box key={`s${i}`} flexDirection="column" rowGap={space.xs}>
      {head}
      {s.text ? <Markdown text={s.text} /> : null}
      {s.items?.length ? itemsOf(g, s.items, `s${i}:items`) : null}
    </Box>
  );
}

/**
 * One item read whole: a dim meta line, a heading, then sections a step apart, each under a
 * `section` heading, of Markdown and of keyed items. The surface scrolls, so there is no
 * `height`, `offset` nor frame. With a `hit` a quiet Button, `action` its word, sits under the
 * title (a Button never wraps), or at the first row's far edge with `isActionAtEdge`.
 */
export function detail(g: Gui, d: DetailProps<GuiSurface>): JSX.Element {
  const { Box, Button } = g.els;
  const hit = d.hit;
  const title = d.title ? typedSpans(g, "heading", inline(d.title)) : null;
  const isEdge = Boolean(d.isActionAtEdge) && hit !== undefined;
  const button =
    hit !== undefined ? (
      <Button key={hit} dimColor label={d.action ?? "Open"} onPress={() => g.press(hit)} />
    ) : null;
  // The first row: its words shrink, the Button keeps its size.
  const first = (words: JSX.Element) =>
    isEdge ? (
      <Box
        key="first"
        flexDirection="row"
        flexWrap="nowrap"
        alignItems="center"
        justifyContent="space-between"
        columnGap={across.md}
      >
        <Box flexShrink={1}>{words}</Box>
        <Box flexShrink={0}>{button}</Box>
      </Box>
    ) : (
      words
    );
  const head =
    d.meta || d.title ? (
      <Box key="head" flexDirection="column" rowGap={space.xs}>
        {d.meta ? first(typed(g, "caption", d.meta)) : null}
        {d.meta ? title : first(title ?? <Box />)}
      </Box>
    ) : null;
  const rest = [
    hit !== undefined && !isEdge ? (
      <Box key="open" flexDirection="row">
        {button}
      </Box>
    ) : null,
    ...(d.sections ?? []).map((s, i) => sectionOf(g, s, i)),
  ].filter(Boolean);
  // A heading of the host's own leaves its space below it, which is the step to what follows.
  return (
    <Box
      flexDirection="column"
      rowGap={d.title && hasHeadingGap(g) ? 0 : space.md}
      paddingX={d.isFlush ? undefined : across.inset}
    >
      {head}
      <Box flexDirection="column" rowGap={space.md}>
        {rest}
      </Box>
    </Box>
  );
}
