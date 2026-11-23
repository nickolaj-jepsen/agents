/** The status band on the graphical surfaces: an icon, the text and quiet buttons. */
import {
  meaning,
  rowOf,
  rows,
  typed,
  type Gui,
  type GuiSurface,
} from "@agents/kit-core/paint/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { StatusBandProps } from "./contract.ts";
import { view } from "./model.ts";

/** What `statusBand` is given on a graphical surface; a field only a terminal has is not in it. */
export type StatusBandGui = StatusBandProps<GuiSurface>;

/**
 * The band's line: the status mark, the text, a quiet way-in button (`hint`) and a quiet button
 * per further action, at the inset. A button's `hit` goes to `g.press`.
 */
export function statusBand(g: Gui, b: StatusBandGui): JSX.Element {
  const { Box, Button } = g.els;
  const v = view(b, g.surface);
  const { across } = tokens.gui;
  const isOneLine = Boolean(b.isOneLine);
  const mark = v.mark ? meaning(g, v.mark) : null;
  const words = (
    <Box flexShrink={1} flexGrow={isOneLine ? 1 : undefined}>
      {typed(g, "body", v.text, { wrap: isOneLine ? "truncate-end" : undefined })}
    </Box>
  );
  // A line of the band, not a call to arms: every button is quiet, so the prompt's send stays
  // the one filled control in view.
  const buttons = v.buttons.map((x) => (
    <Button key={x.hit} dimColor label={x.label} onPress={() => g.press?.(x.hit)} />
  ));
  if (v.layout === "line")
    return (
      <Box flexDirection="column" paddingX={across.inset}>
        {rowOf(
          g,
          {},
          <Box
            flexDirection="row"
            flexWrap="nowrap"
            alignItems="center"
            columnGap={across.sm}
            flexGrow={1}
          >
            {mark}
            {words}
            <Box flexDirection="row" flexShrink={0} columnGap={across.xs}>
              {buttons}
            </Box>
          </Box>,
        )}
      </Box>
    );
  return (
    <Box flexDirection="column" paddingX={across.inset}>
      {rows(
        g,
        {},
        rowOf(
          g,
          {},
          <Box flexDirection="row" flexWrap="nowrap" alignItems="center" columnGap={across.sm}>
            {mark}
            {words}
          </Box>,
        ),
        rowOf(
          g,
          {},
          <Box flexDirection="row" flexWrap="wrap" columnGap={across.xs}>
            {buttons}
          </Box>,
        ),
      )}
    </Box>
  );
}
