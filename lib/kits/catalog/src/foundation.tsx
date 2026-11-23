/** The foundation's graphical stories (`foundation.ts` lists them): each piece alone. */
import { meanings, type MeaningName } from "@agents/kit-core/icons.ts";
import type { Gui, GuiStories } from "@agents/kit-core/paint/gui.tsx";
import {
  blocks,
  column,
  meaning,
  panel,
  rowOf,
  rows,
  typed,
  typedSpans,
} from "@agents/kit-core/paint/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import { FAMILIES, ROLES, SAMPLES } from "./foundation.ts";

const inset = tokens.gui.across.inset;

/** A row of the icons story: the icon, and its name. */
const iconRow = (g: Gui, name: MeaningName, key: string) =>
  rowOf(
    g,
    { key },
    meaning(g, name),
    typed(g, "body", name),
    typed(g, "caption", meanings[name].alt),
  );

/** Every meaning in a well of one colour: an Svg keeps its colours, so this is what it shows on that theme. */
const well = (
  g: Gui,
  label: string,
  background: string,
  text: string,
  names: readonly MeaningName[],
) => {
  const { Box, Text } = g.els;
  return (
    <Box
      key={label}
      flexDirection="column"
      backgroundColor={background}
      paddingX={inset}
      paddingY={0.5}
      rowGap={0.15}
    >
      <Text color={text} bold>
        {label}
      </Text>
      {names.map((name) => (
        <Box key={name} flexDirection="row" alignItems="center" columnGap={tokens.gui.across.sm}>
          {meaning(g, name)}
          <Text color={text}>{name}</Text>
        </Box>
      ))}
    </Box>
  );
};

export const foundationGuiStories: GuiStories = {
  roles: (g) => {
    const { Box } = g.els;
    return blocks(
      g,
      ...ROLES.map((role) => (
        <Box key={role} flexDirection="column" paddingX={inset}>
          {typed(g, "caption", `${role}: tokens.type.${role}`)}
          {typed(g, role, SAMPLES[role])}
        </Box>
      )),
      <Box key="specials" flexDirection="column" paddingX={inset}>
        {typed(g, "caption", "a heading of spans: Markdown characters stay words, code is code")}
        {typedSpans(g, "heading", [
          { text: "a*b_c #1 [x](y) <i> " },
          { text: "code`tick", role: "code" },
          { text: " and bold", bold: true },
        ])}
      </Box>,
      <Box key="tabular" flexDirection="column" paddingX={inset}>
        {typed(g, "caption", "tabular digits")}
        {typed(g, "body", "1 112 and 8 888 line up", { tabular: true })}
        {typed(g, "body", "8 888 and 1 112 line up", { tabular: true })}
      </Box>,
    );
  },
  panel: (g) => {
    const { Box, Button } = g.els;
    return blocks(
      g,
      <Box key="before" paddingX={inset}>
        {typed(g, "body", "AGENTS.md")}
      </Box>,
      <Box key="open" paddingX={inset}>
        {panel(
          g,
          {},
          typed(g, "heading", "Edit the claim"),
          typed(g, "body", "The line contradicts what the code does now."),
          rowOf(
            g,
            {},
            <Button key="a" variant="primary" label="Apply" onPress={() => g.press("apply")} />,
            <Button key="d" dimColor label="Dismiss" onPress={() => g.press("dismiss")} />,
          ),
        )}
      </Box>,
      <Box key="after" paddingX={inset}>
        {typed(g, "body", "README.md")}
      </Box>,
    );
  },
  icons: (g) =>
    blocks(
      g,
      ...FAMILIES.map(([family, names]) =>
        column(
          g,
          { key: family, gap: "xs" },
          <g.els.Box key="h" paddingX={inset}>
            {typed(g, "section", family)}
          </g.els.Box>,
          <g.els.Box key="r" flexDirection="column" paddingX={inset}>
            {rows(g, {}, ...names.map((n) => iconRow(g, n, n)))}
          </g.els.Box>,
        ),
      ),
    ),
  light: (g) => {
    // The neutral greys and the filled urgent mark are the ones a light theme puts at risk: first.
    const all = Object.keys(meanings) as MeaningName[];
    const first = all.filter((n) => /^(priority|field|decision|kind:missing)/.test(n));
    const names = [...first, ...all.filter((n) => !first.includes(n))];
    return blocks(
      g,
      well(g, "On a light theme (white)", "#ffffff", "#1f2328", names),
      well(g, "On a dark theme (near black)", "#1f1f1f", "#e6e6e6", names),
    );
  },
  rhythm: (g) => {
    const { Box, Button } = g.els;
    return (
      <Box flexDirection="column" paddingX={inset}>
        {rows(
          g,
          {},
          rowOf(g, { key: "1" }, meaning(g, "priority:high"), typed(g, "body", "A row of text")),
          rowOf(
            g,
            { key: "2", justify: "space-between" },
            typed(g, "body", "A row with a button"),
            <Button key="b" dimColor label="Open" onPress={() => g.press("open")} />,
          ),
          rowOf(g, { key: "3" }, meaning(g, "priority:low"), typed(g, "body", "A row of text")),
          rowOf(
            g,
            { key: "4", justify: "space-between" },
            typed(g, "body", "A row with a button"),
            <Button key="b" dimColor label="Open" onPress={() => g.press("open")} />,
          ),
        )}
      </Box>
    );
  },
};
