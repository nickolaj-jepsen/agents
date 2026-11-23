/**
 * Fields on the graphical surfaces: always a two-column grid, a label column of a fixed width and
 * the value's own control beside it. Read and edit are one layout: a field's editor (data in the
 * model) is the control in its cell, so nothing moves when one is used. A `Select` shows a pick,
 * toggle chips and a search are the cell of several-of-many, an `Input` the cell of text. Keys are
 * not drawn: a graphical field is pressed, not typed.
 */
import type { MeaningName } from "@agents/kit-core/icons.ts";
import { meaning, rows, type Gui } from "@agents/kit-core/paint/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import { fieldHit, fieldOf, optionHit, searchHit, type FieldsProps } from "./contract.ts";
import { view, type Cell } from "./model.ts";
import type { GuiSurface } from "@agents/kit-core/paint/gui.tsx";

const { space, across, labelColumn, maxLabel } = tokens.gui;

/** The longest a chip's words are, with its mark beside it, before a 420-pixel pane runs out. */
const CHIP = 22;
/** An icon and the gap after it, in cells. */
const ICON = 2;

/** What `fields` is given on a graphical surface; a field only a terminal has is not in it. */
export type FieldsGui = FieldsProps<GuiSurface>;

/**
 * A chip: a quiet Button, with the chosen mark before it where it is on. A Button never wraps and
 * is never cut, so words too long for one are text beside a quiet Button that turns it off, on or adds it.
 */
function chip(g: Gui, key: string, label: string, hit: string, on?: boolean): JSX.Element {
  const { Box, Button, Text } = g.els;
  const isLong = label.length > CHIP;
  return (
    <Box key={key} flexDirection="row" alignItems="center" columnGap={across.xs}>
      {on ? meaning(g, "state:success", { alt: "Chosen" }) : null}
      {isLong ? (
        <Box flexShrink={1}>
          <Text>{label}</Text>
        </Box>
      ) : null}
      <Button
        key={hit}
        dimColor
        label={isLong ? (on ? "Turn off" : on === false ? "Turn on" : "Add") : label}
        onPress={() => g.press(hit)}
      />
    </Box>
  );
}

/**
 * The cell of one field: its meaning icon, which stands in the icon slot, and its control, which
 * starts at the column's one edge.
 */
function cell(
  g: Gui,
  id: string,
  hit: string | undefined,
  c: Cell,
): { icon?: MeaningName; body: JSX.Element } {
  const { Box, Text, Button, Input, Select } = g.els;
  switch (c.kind) {
    case "select":
      return {
        icon: c.icon,
        body: (
          <Select
            key={`select:${id}`}
            value={c.value}
            options={c.options.map((o) => ({ value: o.value, label: o.label }))}
            onSelect={(value) => g.press(optionHit(id, value))}
          />
        ),
      };
    case "input":
      return {
        body: (
          <Input
            key={`input:${id}`}
            value={c.value}
            onInput={(text) => g.input(fieldHit(id), text)}
            onSubmit={(text) => g.submit(fieldHit(id), text)}
          />
        ),
      };
    case "chips":
      return {
        body: (
          <Box key={`cell:${id}`} flexDirection="column" rowGap={space.sm}>
            {c.chips.length > 0 ? (
              <Box flexDirection="row" flexWrap="wrap" columnGap={across.xs} rowGap={space.xs}>
                {c.chips.map((o) =>
                  chip(g, `chip:${o.value}`, o.label, optionHit(id, o.value), o.on),
                )}
              </Box>
            ) : null}
            <Input
              key={`search:${id}:${c.revision}`}
              value={c.query}
              placeholder="Find one to add"
              onInput={(text) => g.input(searchHit(id), text)}
              onSubmit={(text) => g.submit(searchHit(id), text)}
            />
            {c.matches.length > 0 ? (
              <Box flexDirection="row" flexWrap="wrap" columnGap={across.xs} rowGap={space.xs}>
                {c.matches.map((o) => chip(g, `match:${o.value}`, o.label, optionHit(id, o.value)))}
              </Box>
            ) : c.query.trim() ? (
              <Text dimColor italic>
                No match
              </Text>
            ) : null}
          </Box>
        ),
      };
    case "press":
      // A Button never wraps: a value too long for one is text, which a Button after it opens.
      return {
        icon: c.icon,
        body:
          c.text.length > maxLabel ? (
            <Text>{c.text}</Text>
          ) : (
            <Button dimColor label={c.text} onPress={() => (hit ? g.press(hit) : undefined)} />
          ),
      };
    case "text":
      return {
        icon: c.icon,
        body: (
          <Text dimColor={c.empty || undefined} italic={c.empty || undefined}>
            {c.text}
          </Text>
        ),
      };
    case "lettered":
      return { body: <Text key={`cell:${id}`}>{c.text}</Text> };
  }
}

/**
 * One value each, named, in a grid of a label column and a value column. A label and its value
 * never wrap together like words: the label column is `tokens.gui.labelColumn` cells and the
 * value takes the rest. Each row is a `rowOf`, so a field with a Select is no taller than one
 * with words by more than its control.
 */
export function fields(g: Gui, props: Pick<FieldsGui, "fields">): JSX.Element {
  const { Box, Text } = g.els;
  const v = view({ fields: props.fields }, g.surface);
  return (
    <Box flexDirection="column" paddingX={across.inset}>
      {rows(
        g,
        {},
        ...v.rows.map((row, i) => {
          const id = fieldOf(row.hit) ?? `${i}`;
          const slot = cell(g, id, row.hit, row.cell);
          return (
            <Box
              key={`field:${id}`}
              flexDirection="row"
              alignItems="flex-start"
              columnGap={across.sm}
            >
              <Box flexShrink={0} minWidth={labelColumn} paddingTop={0.45}>
                <Text dimColor>{row.label}</Text>
              </Box>
              {/* Every row has the same icon slot, empty where a field has no icon, so each control
                  of the value column starts at one edge, and the Selects are one width. */}
              <Box
                width={0}
                flexGrow={1}
                flexShrink={1}
                flexDirection="row"
                flexWrap="nowrap"
                alignItems="flex-start"
                columnGap={across.sm}
                paddingY={tokens.gui.row.pad}
              >
                <Box flexShrink={0} paddingTop={0.2}>
                  {slot.icon ? meaning(g, slot.icon) : <Box paddingLeft={ICON} />}
                </Box>
                <Box flexGrow={1} flexShrink={1} minWidth={0}>
                  {slot.body}
                </Box>
              </Box>
            </Box>
          );
        }),
      )}
    </Box>
  );
}

/**
 * One text field the width of its room, for a value that is not in the grid: a record's title,
 * edited in the place it is read. Its events are the context's: `g.input(hit, text)` and
 * `g.submit(hit, text)`. A new `revision` starts the host's field afresh.
 */
export function input(
  g: Gui,
  props: { hit: string; value: string; placeholder?: string; revision?: number },
): JSX.Element {
  const { Input } = g.els;
  return (
    <Input
      key={`input:${props.hit}:${props.revision ?? 0}`}
      value={props.value}
      placeholder={props.placeholder}
      onInput={(text) => g.input(props.hit, text)}
      onSubmit={(text) => g.submit(props.hit, text)}
    />
  );
}
