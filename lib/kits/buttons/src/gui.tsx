/** The button row on the graphical surfaces: native Buttons, the suggested one filled. */
import type { Gui, GuiSurface } from "@agents/kit-core/paint/gui.tsx";
import { rows as column, spans } from "@agents/kit-core/paint/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { ButtonsProps } from "./contract.ts";
import { view } from "./model.ts";

/** Before the label of the chosen button. */
const CHECK = "\u2713";

/**
 * The buttons of a screen's footer: a row each, every row starting at the same edge, a Button
 * per action. The view model decides what is lit (one only), what is quiet while Close asks, and
 * that a keyboard-only hint is not drawn: a surface with a pointer has no use for a key and no
 * place to show one. VS Code paints a Button by its `dimColor` alone, so the suggested one is
 * `primary` and the rest are dimmed. The host wraps a row, so nothing drops.
 * @param props `rows` are the actions; a label is capitalised unless it is `isLiteral`. `lead`
 * is drawn as a caption before the first Button of the first row.
 * @returns `null` when there is nothing to draw.
 */
export function buttonRow(g: Gui, props: ButtonsProps<GuiSurface>): JSX.Element | null {
  const { Box, Button } = g.els;
  const drawn = view(props, g.surface);
  const lead = props.lead?.length ? spans(g, props.lead, { type: "caption" }) : null;
  if (drawn.rows.length === 0 && !lead) return null;
  const all = drawn.rows.length ? drawn.rows : [[]];
  return column(
    g,
    {},
    ...all.map((row, r) => (
      <Box
        key={`r${r}`}
        flexDirection="row"
        flexWrap="wrap"
        alignItems="center"
        columnGap={tokens.gui.across.xs}
        rowGap={tokens.gui.space.xs}
        paddingX={props.isFlush ? undefined : tokens.gui.across.inset}
      >
        {r === 0 ? lead : null}
        {row.map((b) => (
          <Button
            key={b.hit}
            variant={b.tone === "lit" ? "primary" : undefined}
            dimColor={b.tone !== "lit" || undefined}
            // VS Code fills any Button that is not dim and draws only its label, so the chosen
            // one stays dim and says so in its words: a check before them.
            label={b.tone === "chosen" ? `${CHECK} ${b.label}` : b.label}
            onPress={() => g.press(b.hit as string)}
          />
        ))}
      </Box>
    )),
  );
}
