/**
 * Fields on the graphical surfaces: a label column beside each value, a value that opens
 * a quiet Button, and an editor of the host's in place of the field being edited. Keys are not
 * drawn: a graphical field is pressed, not typed.
 */
import type { Gui } from "@agents/kit-core/paint/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import { fieldOf, type Field, type FieldsOptions } from "./contract.ts";

const { space, across, labelColumn } = tokens.gui;

export type FieldsGuiOptions = FieldsOptions & {
  /**
   * A control of the host's (an `Input`, a `Select`) by field id (`fieldOf(hit)`), drawn in
   * place of that field's value: the field being edited.
   */
  editors?: Record<string, JSX.Element>;
  /**
   * The control a quiet Done Button under an open editor is, so an editor that a pick does not
   * close (an Input, a list of ticks) has a way back to the value.
   */
  done?: string;
};

/**
 * One value each, named. A field with a `hit` is a quiet Button holding its value, which opens
 * it; one without is only read. `inline` sets the fields in a wrapping row, label over value.
 */
export function fields(g: Gui, all: readonly Field[], options: FieldsGuiOptions = {}): JSX.Element {
  const { Box, Text, Button } = g.els;
  const { inline: isInline = false, editors = {}, done } = options;
  const value = (f: Field, i: number) => {
    const id = fieldOf(f.hit);
    const editor = id === undefined ? undefined : editors[id];
    if (editor && done !== undefined)
      return (
        <Box key={`editor:${f.hit}`} flexDirection="column" rowGap={space.xs}>
          {editor}
          <Box flexDirection="row">
            <Button key={done} dimColor label="Done" onPress={() => g.press?.(done)} />
          </Box>
        </Box>
      );
    if (editor) return editor;
    if (f.hit) {
      const hit = f.hit;
      // A Button never wraps: a value too long for one is text, with a Button to open it.
      if (f.value.length > tokens.gui.maxLabel)
        return (
          <Box
            key={`value:${hit}`}
            flexDirection="column"
            rowGap={space.xs}
            alignItems="flex-start"
          >
            <Text>{f.value}</Text>
            <Button key={`change:${hit}`} dimColor label="Change" onPress={() => g.press?.(hit)} />
          </Box>
        );
      // Every Button here is quiet (`dimColor`): the surface fills any other. An empty value
      // is dim italic text beside a quiet Set, so it differs from a set one without a fill.
      if (f.empty)
        return (
          <Box key={`value:${hit}`} flexDirection="row" alignItems="center" columnGap={across.sm}>
            <Text dimColor italic>
              {f.value}
            </Text>
            <Button key={`set:${hit}`} dimColor label="Set" onPress={() => g.press?.(hit)} />
          </Box>
        );
      return (
        <Button key={`value:${hit}`} dimColor label={f.value} onPress={() => g.press?.(hit)} />
      );
    }
    return (
      <Text key={`value:${i}`} dimColor={f.empty || undefined} italic={f.empty || undefined}>
        {f.value}
      </Text>
    );
  };
  if (isInline)
    return (
      <Box
        flexDirection="row"
        flexWrap="wrap"
        alignItems="center"
        columnGap={across.md}
        rowGap={space.xs}
        paddingX={across.inset}
      >
        {all.map((f, i) => (
          <Box
            key={`field:${f.hit ?? i}`}
            flexDirection="row"
            alignItems="flex-start"
            columnGap={across.xs}
          >
            <Text dimColor>{f.label}</Text>
            {value(f, i)}
          </Box>
        ))}
      </Box>
    );
  return (
    <Box flexDirection="column" rowGap={space.xs} paddingX={across.inset}>
      {all.map((f, i) => (
        <Box
          key={`field:${f.hit ?? i}`}
          flexDirection="row"
          columnGap={across.sm}
          alignItems="flex-start"
        >
          <Box flexShrink={0} minWidth={labelColumn}>
            <Text dimColor>{f.label}</Text>
          </Box>
          <Box width={0} flexGrow={1} flexShrink={1}>
            {value(f, i)}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
