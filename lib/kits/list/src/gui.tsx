/**
 * The list on the graphical surfaces: groups under a `section` heading, rows of one height a
 * step apart, each led by an icon that says what it is.
 */
import { inline, literal } from "@agents/kit-core/lines.ts";
import {
  icon,
  meaning,
  panel,
  roleProps,
  rowOf,
  rows as column,
  spans,
  typeProps,
  type Gui,
  type GuiSurface,
} from "@agents/kit-core/paint/gui.tsx";
import { can } from "@agents/kit-core/surfaces.ts";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { ListProps } from "./contract.ts";
import { view, type GroupView, type RowView } from "./model.ts";

type Props = ListProps<GuiSurface, JSX.Element>;

const { across } = tokens.gui;

/** What each mark is called for a reader who cannot see its icon. */
const MARK_TEXT = { open: "Left alone", chosen: "Chosen", dropped: "Set aside" } as const;

/** A row's lead: its meaning, or the bare mark where it was given none. */
function leadOf(g: Gui, r: RowView): JSX.Element | null {
  if (!r.lead) return null;
  const { Box } = g.els;
  return (
    <Box key="lead" flexShrink={0}>
      {"meaning" in r.lead
        ? meaning(g, r.lead.meaning)
        : icon(g, r.lead.mark, {
            tone: r.lead.mark === "chosen" ? "accent" : "neutral",
            alt: MARK_TEXT[r.lead.mark],
          })}
    </Box>
  );
}

/** A quiet Button at a row's or heading's edge. */
function control(g: Gui, c: { hit: string; label: string }, key = c.hit): JSX.Element {
  const { Box, Button } = g.els;
  return (
    <Box key={`c:${c.hit}`} flexShrink={0}>
      <Button key={key} dimColor label={c.label} onPress={() => g.press(c.hit)} />
    </Box>
  );
}

/**
 * One row: its lead beside the first line, the text (wrapped whole, or one line the surface cuts),
 * a count or time in the list's shared right-aligned column before the Button, which is at the far
 * edge. A word aside follows the text. Two Buttons would crowd the text of a narrow pane, so they
 * sit under it. A row opened in place gives its claim the panel's width: its lead, aside and
 * Button are a line of their own over it.
 * @param asideCells The width of the shared aside column, 0 where the list has none.
 */
function item(g: Gui, r: RowView, key: string, isCut: boolean, asideCells: number): JSX.Element {
  const { Box, Text } = g.els;
  const words = (
    <Text dimColor={r.isDim || undefined} wrap={isCut ? "truncate-end" : undefined}>
      {spans(g, r.isLiteral ? literal(r.text) : inline(r.text))}
    </Text>
  );
  const isStacked = r.action !== undefined && r.step !== undefined;
  const single = isStacked ? null : (r.action ?? r.step);
  const under = isStacked ? (
    <Box key="under" flexDirection="row" flexWrap="wrap" columnGap={across.xs}>
      {control(g, r.action!)}
      {control(g, r.step!)}
    </Box>
  ) : null;
  // The shared column keeps every row's text the same width; a row without a count leaves it blank.
  const column =
    asideCells > 0 ? (
      <Box key="count" flexShrink={0} minWidth={asideCells} justifyContent="flex-end">
        {r.asideIn === "column" ? (
          <Text {...typeProps("caption", { tabular: true })}>{r.aside}</Text>
        ) : null}
      </Box>
    ) : null;
  if (r.isOpened)
    return (
      <Box key={key} flexDirection="column" rowGap={tokens.gui.space.xs}>
        {rowOf(
          g,
          { key: `${key}:head`, justify: "space-between" },
          <Box key="who" flexDirection="row" alignItems="center" columnGap={across.sm}>
            {leadOf(g, r)}
            {r.aside ? <Text {...typeProps("caption", { tabular: true })}>{r.aside}</Text> : null}
          </Box>,
          single ? control(g, single) : null,
        )}
        <Box key="claim">{words}</Box>
        {under}
      </Box>
    );
  const follows =
    r.asideIn === "text" ? (
      <Box key="aside" flexShrink={0}>
        <Text {...typeProps("caption")}>{r.aside}</Text>
      </Box>
    ) : null;
  return rowOf(
    g,
    { key, align: "start" },
    leadOf(g, r),
    <Box key="body" flexDirection="column" flexGrow={1} flexShrink={1} rowGap={tokens.gui.space.xs}>
      <Box
        key="line"
        flexDirection="row"
        flexWrap="nowrap"
        alignItems="flex-start"
        columnGap={across.sm}
      >
        <Box key="text" flexShrink={1} flexGrow={follows ? 0 : 1}>
          {words}
        </Box>
        {follows}
      </Box>
      {under}
    </Box>,
    column,
    single ? control(g, single) : null,
  );
}

/** A group's heading: its label in the `section` role, its controls at the far edge. */
function heading(g: Gui, group: GroupView, key: string): JSX.Element {
  const { Box, Text } = g.els;
  const section = typeProps("section", { isSized: can(g, "textSize") });
  const label = (
    <Box key="label" flexDirection="row" alignItems="center" columnGap={across.sm} flexShrink={1}>
      <Text
        {...section}
        // A host with no sizes would draw `section` dim, under the rows it heads: a group's label
        // keeps the role's weight and the text colour, or the accent for the keyboard's group.
        {...(group.isActive ? roleProps("accent") : {})}
        dimColor={undefined}
      >
        {group.label}
      </Text>
      {group.isDone ? meaning(g, "state:success", { alt: "Decided" }) : null}
    </Box>
  );
  // A plain section label is not a control row. Keep it close to the items it names.
  if (!group.action && !group.actions.length) return label;
  return rowOf(
    g,
    { key, justify: "space-between" },
    label,
    <Box key="actions" flexDirection="row" flexWrap="wrap" columnGap={across.xs} flexShrink={0}>
      {group.action ? control(g, group.action) : null}
      {group.actions.map((a) => control(g, a))}
    </Box>,
  );
}

/**
 * Groups of rows under a heading, a step apart. The host scrolls the pane, so there is no window,
 * no rails, no flat rows and no key. A row's text wraps whole, or with `lines: 1` is one line the
 * surface cuts at its edge, except an opened row's, which is shown whole in a panel with what
 * belongs to it. A group of more than `maxItems` rows shows that many, then `Show N more`.
 */
export function list(g: Gui, l: Props): JSX.Element {
  const { Box } = g.els;
  const v = view(l, g.surface);
  const under = l.opened ?? {};
  // Where rows can open, a row sits as far in as an opened row's text does, inside its panel, so
  // opening one moves nothing beside it.
  const inset = across.inset + (l.opened ? tokens.gui.panel.x : 0);
  return (
    <Box flexDirection="column" rowGap={tokens.gui.space.md}>
      {v.groups.map((group, i) => (
        <Box key={`g${i}`} flexDirection="column" rowGap={tokens.gui.row.gap}>
          {group.label ? (
            <Box key="head" paddingX={across.inset} flexDirection="column">
              {heading(g, group, `g${i}:head`)}
            </Box>
          ) : null}
          {column(
            g,
            { key: "rows" },
            ...group.rows.map((r, n) => {
              const key = `g${i}:r${n}`;
              const isCut = l.lines === 1 && !r.isOpened;
              const row = item(g, r, key, isCut, v.asideCells);
              const open = r.hit === undefined ? undefined : under[r.hit];
              // An opened row sits with what belongs to it in a panel, so where it ends shows.
              return open ? (
                <Box key={`${key}:panel`} paddingX={across.inset} flexDirection="column">
                  {panel(g, { gap: "sm" }, row, open)}
                </Box>
              ) : (
                <Box key={`${key}:row`} paddingX={inset} flexDirection="column">
                  {row}
                </Box>
              );
            }),
          )}
          {group.more ? (
            <Box key="more" paddingX={inset} flexDirection="row">
              {rowOf(g, {}, control(g, group.more, `g${i}:more:${group.more.hit}`))}
            </Box>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}
