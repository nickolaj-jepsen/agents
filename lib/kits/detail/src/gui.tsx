/** The detail on the graphical surfaces: a meta line, a title, sections of text and keyed rows. */
import { inline } from "@agents/kit-core/lines.ts";
import { capital, spans, type Gui } from "@agents/kit-core/paint/gui.tsx";
import { prose } from "@agents/kit-prose/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { Detail, DetailItem, DetailSection } from "./contract.ts";

const { across, space } = tokens.gui;

/** A rule's dim words, and its action at the far edge as a quiet Button: the style allows no drawn line across. */
function ruleOf(g: Gui, s: DetailSection, key: string): JSX.Element {
  const { Box, Button, Text } = g.els;
  const parts = (typeof s.rule === "string" ? [s.rule] : (s.rule ?? [])).filter(Boolean);
  const action = s.action?.hit === undefined ? undefined : s.action;
  return (
    <Box
      key={key}
      flexDirection="row"
      flexWrap="nowrap"
      alignItems="center"
      columnGap={across.md}
      paddingX={across.inset}
    >
      <Box flexShrink={1}>
        <Text dimColor weight="semibold">
          {parts.join("  ·  ")}
        </Text>
      </Box>
      <Box flexGrow={1} />
      {action ? (
        <Box flexShrink={0}>
          <Button
            key={action.hit}
            dimColor
            label={capital(action.label)}
            onPress={() => g.press?.(action.hit!)}
          />
        </Box>
      ) : null}
    </Box>
  );
}

/** Keyed rows: the keys in one dim column, each value wrapped beside its key. */
function itemsOf(g: Gui, items: readonly DetailItem[], key: string): JSX.Element {
  const { Box, Text } = g.els;
  return (
    <Box key={key} flexDirection="column" rowGap={space.xs} paddingX={across.inset}>
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
  const { Box, Text } = g.els;
  return (
    <Box key={`s${i}`} flexDirection="column" rowGap={space.xs}>
      {s.rule !== undefined ? ruleOf(g, s, `s${i}:rule`) : null}
      {s.heading ? (
        <Box key={`s${i}:head`} paddingX={across.inset}>
          <Text dimColor weight="semibold">
            {s.heading}
          </Text>
        </Box>
      ) : null}
      {s.text ? prose(g, s.text) : null}
      {s.items?.length ? itemsOf(g, s.items, `s${i}:items`) : null}
    </Box>
  );
}

/** What only a graphical surface decides about a detail. */
export type DetailGuiOptions = {
  /** The word on the quiet Button the detail's `hit` is. @default "Open" */
  action?: string;
  /**
   * The Button on the first row (the meta line, or the title without one) at the far edge, as a
   * caption rule's control is, instead of a row of its own under the title.
   */
  isActionAtEdge?: boolean;
};

/**
 * One item read whole: a dim meta line, a semibold title, then sections a step apart, each under
 * a rule or a dim heading, of Markdown and of keyed rows. The surface scrolls, so there is no
 * `height`, `offset` nor frame. With a `hit` a quiet Button, `action` ("Open") its word, sits
 * under the title (a Button never wraps), or at the first row's far edge with `isActionAtEdge`.
 */
export function detail(g: Gui, d: Detail, options: DetailGuiOptions = {}): JSX.Element {
  const { Box, Button, Text } = g.els;
  const hit = d.hit;
  const title = d.title ? <Text weight="semibold">{spans(g, inline(d.title))}</Text> : null;
  const isEdge = Boolean(options.isActionAtEdge) && hit !== undefined;
  const button =
    hit !== undefined ? (
      <Button key={hit} dimColor label={options.action ?? "Open"} onPress={() => g.press?.(hit)} />
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
      <Box key="head" flexDirection="column" rowGap={space.xs} paddingX={across.inset}>
        {d.meta ? first(<Text dimColor>{d.meta}</Text>) : null}
        {d.meta ? title : first(title ?? <Text />)}
      </Box>
    ) : null;
  return (
    <Box flexDirection="column" rowGap={space.md}>
      {head}
      {hit !== undefined && !isEdge ? (
        <Box key="open" paddingX={across.inset}>
          {button}
        </Box>
      ) : null}
      {(d.sections ?? []).map((s, i) => sectionOf(g, s, i))}
    </Box>
  );
}
