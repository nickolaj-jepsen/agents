/** The button row on the graphical surfaces: native Buttons, the suggested one filled. */
import type { Gui } from "@agents/kit-core/paint/gui.tsx";
import { capital, spans } from "@agents/kit-core/paint/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { Button, ButtonRowOptions } from "./contract.ts";

/**
 * A row of actions at the inset: a Button each, the suggested one filled and the rest quiet
 * (VS Code paints a Button by its `dimColor` alone, so the variant follows it). The host wraps
 * the row, so nothing drops and `wrap`, `essential`, `isQuiet` and `hover` have nothing to do.
 * A keyboard-only hint (no `hit`) is not drawn: a surface with a pointer has no use for a key
 * and no place to show one.
 * @param buttons The actions; a label is capitalised unless it is `isLiteral`.
 * @param options `lead` is drawn as text before the first Button.
 * @returns `null` when there is nothing to draw.
 */
export function buttonRow(
  g: Gui,
  buttons: readonly Button[],
  { lead }: Pick<ButtonRowOptions, "lead"> = {},
): JSX.Element | null {
  const { Box, Button } = g.els;
  const drawn = buttons.filter((b) => b.hit !== undefined);
  if (drawn.length === 0 && !lead?.length) return null;
  return (
    <Box
      flexDirection="row"
      flexWrap="wrap"
      alignItems="center"
      columnGap={tokens.gui.across.xs}
      rowGap={tokens.gui.space.xs}
      paddingX={tokens.gui.across.inset}
    >
      {lead?.length ? spans(g, lead) : null}
      {drawn.map((b) => (
        <Button
          key={b.hit}
          variant={b.isLit ? "primary" : undefined}
          dimColor={!b.isLit || undefined}
          label={b.isLiteral ? b.label : capital(b.label)}
          onPress={() => g.press?.(b.hit as string)}
        />
      ))}
    </Box>
  );
}
