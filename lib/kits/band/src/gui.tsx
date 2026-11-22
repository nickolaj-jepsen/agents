/** The status band on the graphical surfaces: an icon, the text and quiet buttons. */
import {
  capital,
  icon,
  type Gui,
  type IconName,
  type IconTone,
} from "@agents/kit-core/paint/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { StatusBand } from "./contract.ts";

/** What only a graphical surface decides about the band. */
export type StatusBandGuiOptions = {
  /** The text in words rather than the terminal's shorthand. @default the band's `text` */
  text?: string;
  /** Replaces the status's own mark. */
  icon?: IconName;
  /** Replaces the status's own colour for the mark. */
  tone?: IconTone;
  /**
   * Everything on one line: the text cut at the edge by the surface, every button after it.
   * For a line that names something already known, not news to read whole. Otherwise, with
   * further actions, the buttons wrap under the text.
   */
  isOneLine?: boolean;
};

/**
 * The band's line: the status mark, the text, a quiet way-in button (`hint`) and a quiet button
 * per further action, at the inset. A button's `hit` goes to `g.press`.
 */
export function statusBand(
  g: Gui,
  { text, hint, hit, status = "warning", actions = [] }: StatusBand,
  options: StatusBandGuiOptions = {},
): JSX.Element {
  const { Box, Button, Text } = g.els;
  const isOneLine = Boolean(options.isOneLine);
  const mark = icon(g, options.icon ?? status, { tone: options.tone ?? status });
  const words = (
    <Box flexShrink={1} flexGrow={isOneLine ? 1 : undefined}>
      <Text wrap={isOneLine ? "truncate-end" : undefined}>{options.text ?? text}</Text>
    </Box>
  );
  // A line of the band, not a call to arms: every button is quiet, so the prompt's send stays
  // the one filled control in view.
  const buttons = [
    <Button key={hit} dimColor label={capital(hint)} onPress={() => g.press?.(hit)} />,
    ...actions.map((a) => (
      <Button key={a.hit} dimColor label={capital(a.label)} onPress={() => g.press?.(a.hit)} />
    )),
  ];
  const { across, space } = tokens.gui;
  if (actions.length === 0 || isOneLine)
    return (
      <Box
        flexDirection="row"
        flexWrap="nowrap"
        columnGap={across.sm}
        alignItems="center"
        paddingX={across.inset}
      >
        {mark}
        {words}
        <Box flexDirection="row" flexShrink={0} columnGap={across.xs}>
          {buttons}
        </Box>
      </Box>
    );
  return (
    <Box flexDirection="column" rowGap={space.xs} paddingX={across.inset}>
      <Box flexDirection="row" flexWrap="nowrap" columnGap={across.sm}>
        {mark}
        {words}
      </Box>
      <Box flexDirection="row" flexWrap="wrap" columnGap={across.xs}>
        {buttons}
      </Box>
    </Box>
  );
}
