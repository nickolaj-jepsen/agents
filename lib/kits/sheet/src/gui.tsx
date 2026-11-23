/**
 * The sheet on the graphical surfaces. The host frames the pane and owns its Close, so there
 * are no edges: a head, a body, a notice and the buttons, in a column. It is the frame's drawing:
 * a sheet is a frame whose footer is several rows, and whose body may be a list of groups.
 */
import { captionFrame, frameTop, type FrameGui, type FrameTopGui } from "@agents/kit-frame/gui.tsx";
import type { Gui } from "@agents/kit-core/paint/gui.tsx";

/** What `sheet` is given on a graphical surface. */
export type SheetGui = Omit<FrameGui, "end">;

/**
 * The sheet's head alone: its title, the `heading` left out where it repeats `hostTitle`, and
 * Close's question with Discard and Keep, where Close asks.
 */
export function sheetHead(g: Gui, s: FrameTopGui): JSX.Element | null {
  return frameTop(g, s);
}

/** A panel: head, body (groups parted by one space), a notice of its own row, then the button rows. */
export function sheet(g: Gui, s: SheetGui): JSX.Element {
  return captionFrame(g, s);
}
