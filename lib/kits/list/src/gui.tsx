/** The list on the graphical surfaces: groups under a heading, rows as full-width Buttons. */
import { inline, literal } from "@agents/kit-core/lines.ts";
import { capital, icon, spans, type Gui } from "@agents/kit-core/paint/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { List, ListGroup, ListMark, ListRow } from "./contract.ts";

/** What only a graphical surface is told about a list: how much of a long group to show. */
export type ListGuiOptions = {
  /**
   * A group shows `maxItems` rows, then an `N more` Button that presses `hit`. Without it every
   * row is shown: the pane scrolls.
   */
  more?: {
    /** The rest is shown: no `N more` row. */
    isAll: boolean;
    hit: string;
  };
  /** Rows a group shows before `N more`. @default `tokens.gui.maxItems` */
  maxItems?: number;
  /**
   * The word on the quiet Button a row's `hit` (or a group's) is: a Button never wraps, so the
   * text is wrapped beside it and the Button names what pressing does. A row's own `action`
   * replaces it. @default "Open"
   */
  action?: string;
  /**
   * Rows opened in place, by the row's `hit`: each element is drawn under its row, and that row's
   * Button says `closeAction`, since pressing it folds the row again. The caller owns what is
   * open, shown in a well (the fill and the inset) with its row's text whole; a long group keeps an opened row in view whatever `maxItems` says.
   */
  opened?: Record<string, JSX.Element>;
  /** The word on the Button of an opened row. @default "Close" */
  closeAction?: string;
};

/** What each mark is called for a reader who cannot see its icon. */
const MARK_TEXT: Record<Exclude<ListMark, "none">, string> = {
  open: "Left alone",
  chosen: "Chosen",
  dropped: "Set aside",
};

/** What a press on a `markHit` Button does: it steps the mark on, in the order of `ListMark`. */
const STEP_TEXT: Record<Exclude<ListMark, "none">, string> = {
  open: "Choose",
  chosen: "Set aside",
  dropped: "Restore",
};

/** A row's mark: an icon. */
function markOf(g: Gui, mark: Exclude<ListMark, "none">): JSX.Element {
  const { Box } = g.els;
  return (
    <Box key="mark" flexShrink={0} height={1} alignItems="center">
      {icon(g, mark, { tone: mark === "chosen" ? "accent" : "neutral", alt: MARK_TEXT[mark] })}
    </Box>
  );
}

/** The control a `markHit` is: a quiet Button naming what a press changes the row to (never filled: many rows may be chosen). */
function markButton(g: Gui, r: ListRow, mark: Exclude<ListMark, "none">): JSX.Element | null {
  const { Box, Button } = g.els;
  const hit = r.markHit;
  if (hit === undefined || r.disabled) return null;
  return (
    <Box key="markHit" flexShrink={0}>
      <Button key={hit} dimColor label={STEP_TEXT[mark]} onPress={() => g.press?.(hit)} />
    </Box>
  );
}

/** One row: its mark, its text wrapped, its aside and Buttons dim at the far edge. */
function rowOf(
  g: Gui,
  r: ListRow,
  key: string,
  hasMarks: boolean,
  action: string,
  isCut: boolean,
): JSX.Element {
  const { Box, Button, Text } = g.els;
  const mark = r.mark ?? "open";
  const isDim = r.disabled || mark === "dropped";
  const words = spans(g, r.literal ? literal(r.text) : inline(r.text));
  const hit = r.hit;
  const open =
    hit !== undefined && !r.disabled ? (
      <Box key="open" flexShrink={0}>
        <Button key={hit} dimColor label={r.action ?? action} onPress={() => g.press?.(hit)} />
      </Box>
    ) : null;
  // Two Buttons crowd the text on a narrow pane: they sit under it.
  const stepper = mark === "none" ? null : markButton(g, r, mark);
  const twoButtons = open !== null && stepper !== null;
  return (
    <Box
      key={key}
      flexDirection="row"
      flexWrap="nowrap"
      alignItems="flex-start"
      columnGap={tokens.gui.across.sm}
      paddingX={tokens.gui.across.inset}
    >
      {hasMarks && mark !== "none" ? markOf(g, mark) : null}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} rowGap={tokens.gui.space.xs}>
        <Box
          flexDirection="row"
          flexWrap="nowrap"
          alignItems="flex-start"
          columnGap={tokens.gui.across.md}
        >
          <Box width={0} flexGrow={1} flexShrink={1} overflow="hidden">
            <Text dimColor={isDim || undefined} wrap={isCut ? "truncate-end" : undefined}>
              {words}
            </Text>
          </Box>
          {r.aside ? (
            <Box flexShrink={0}>
              <Text dimColor>{r.aside}</Text>
            </Box>
          ) : null}
          {twoButtons ? null : (open ?? stepper)}
        </Box>
        {twoButtons ? (
          <Box flexDirection="row" flexWrap="wrap" columnGap={tokens.gui.across.xs}>
            {open}
            {stepper}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

/** A group's heading: its label semibold, its controls quiet Buttons at the far edge. */
function headingOf(g: Gui, group: ListGroup, key: string, action: string): JSX.Element {
  const { Box, Button, Text } = g.els;
  const label = (
    <Text weight="semibold" color={group.active ? "claude" : undefined}>
      {group.label}
    </Text>
  );
  const hit = group.hit;
  const actions = (group.actions ?? []).filter((a) => a.hit);
  return (
    <Box
      key={key}
      flexDirection="row"
      flexWrap="nowrap"
      alignItems="center"
      columnGap={tokens.gui.across.md}
      paddingX={tokens.gui.across.inset}
    >
      <Box
        flexDirection="row"
        flexGrow={1}
        flexShrink={1}
        alignItems="center"
        columnGap={tokens.gui.across.sm}
      >
        <Box flexShrink={1}>{label}</Box>
        {group.done ? (
          <Box flexShrink={0}>{icon(g, "success", { tone: "success", alt: "Decided" })}</Box>
        ) : null}
      </Box>
      {hit !== undefined ? (
        <Box key="open" flexShrink={0}>
          <Button key={hit} dimColor label={action} onPress={() => g.press?.(hit)} />
        </Box>
      ) : null}
      {actions.map((a) => (
        <Box key={`a:${a.hit}`} flexShrink={0}>
          <Button key={a.hit} dimColor label={capital(a.label)} onPress={() => g.press?.(a.hit!)} />
        </Box>
      ))}
    </Box>
  );
}

/**
 * Groups of rows under a heading, a step apart. The host scrolls the pane, so there is no window
 * (`height`, `top`), no rails, no flat rows and no key; a row's text wraps whole, or with `lines: 1`
 * is one line the surface cuts at its edge. A group of more
 * than `maxItems` rows shows that many, then an `N more` Button (`more`).
 */
export function list(g: Gui, l: List, options: ListGuiOptions = {}): JSX.Element {
  const { Box, Button } = g.els;
  const { space, across } = tokens.gui;
  const action = options.action ?? "Open";
  const max = options.maxItems ?? tokens.gui.maxItems;
  const opened = options.opened ?? {};
  const closeAction = options.closeAction ?? "Close";
  // One line a row, the surface cutting at the edge; an opened row is shown whole. More lines wrap whole.
  const isCut = l.lines === 1;
  const hasMarks = l.groups.some((group) => group.rows.some((r) => r.mark !== "none"));
  return (
    <Box flexDirection="column" rowGap={space.md}>
      {l.groups.map((group, i) => {
        const capped = options.more && !options.more.isAll && group.rows.length > max;
        const isOpened = (r: ListRow) => r.hit !== undefined && opened[r.hit] !== undefined;
        const shown = capped ? group.rows.filter((r, n) => n < max || isOpened(r)) : group.rows;
        const left = group.rows.length - shown.length;
        return (
          <Box key={`g${i}`} flexDirection="column" rowGap={space.xs}>
            {group.label ? headingOf(g, group, `g${i}:head`, action) : null}
            <Box flexDirection="column" rowGap={space.xs}>
              {shown.flatMap((r, n) => {
                const under = r.hit === undefined ? undefined : opened[r.hit];
                const row = rowOf(
                  g,
                  r,
                  `g${i}:r${n}`,
                  hasMarks,
                  under ? closeAction : action,
                  isCut && !under,
                );
                // An opened row sits with what belongs to it in a well, so where it ends shows.
                return under
                  ? [
                      <Box
                        key={`g${i}:r${n}:opened`}
                        flexDirection="column"
                        rowGap={space.sm}
                        paddingY={space.sm}
                        backgroundColor={tokens.gui.fill}
                        // A round border is the surface's only rounded corner; it is drawn in no colour.
                        borderStyle="round"
                        borderColor="#00000000"
                      >
                        {row}
                        {under}
                      </Box>,
                    ]
                  : [row];
              })}
            </Box>
            {capped && options.more ? (
              <Box key={`g${i}:more`} paddingX={across.inset}>
                <Button
                  key={`g${i}:more:${options.more.hit}`}
                  dimColor
                  label={`${left} more`}
                  onPress={() => g.press?.(options.more!.hit)}
                />
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
