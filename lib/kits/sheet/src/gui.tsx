/**
 * The sheet on the graphical surfaces. The host frames the pane and owns its Close, so there
 * are no edges: a head, a body, a notice and the buttons, in a column.
 *
 * As in the frame, the body and the footer rows are elements in the options, drawn with the
 * kit's own `gui.tsx` functions, in place of the contract's `Line[]`.
 */
import type { Gui } from "@agents/kit-core/paint/gui.tsx";
import type { Button } from "@agents/kit-buttons/contract.ts";
import { footerRow, head, noticeRow, type FrameHeadOptions } from "@agents/kit-frame/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { Sheet } from "./contract.ts";

export type SheetGui = Pick<Sheet, "title" | "caption" | "close" | "notice">;

export type SheetOptions = FrameHeadOptions & {
  /**
   * The body, in place of `Line[]`. A list is groups, each parted from the next, and from the
   * notice and the buttons, by the same space: nulls are left out.
   */
  body: JSX.Element | readonly (JSX.Element | null | undefined)[];
  /** The button rows, drawn by `buttonRow`; none is lit while `close.confirming`. */
  footer?: readonly (readonly Button[])[];
};

/**
 * The sheet's head alone: its title, semibold and left out where it repeats `hostTitle`, and
 * the question Close asks with Discard and Keep, at the far edge.
 */
export function sheetHead(
  g: Gui,
  s: Pick<Sheet, "title" | "close">,
  options: FrameHeadOptions = {},
): JSX.Element | null {
  return head(g, s, options);
}

/** A panel: head, body, a notice of its own row, then the button rows. */
export function sheet(g: Gui, s: SheetGui, options: SheetOptions): JSX.Element {
  const { Box } = g.els;
  return (
    <Box flexDirection="column" rowGap={tokens.gui.space.md}>
      {head(g, s, options)}
      {Array.isArray(options.body) ? options.body.filter(Boolean) : options.body}
      {noticeRow(g, s.notice)}
      {options.footer?.map((row, i) => (
        <Box key={`f${i}`}>{footerRow(g, row, s.close?.confirming)}</Box>
      ))}
    </Box>
  );
}
