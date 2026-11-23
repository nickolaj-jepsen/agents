/**
 * The frame's view model: what its head, its footer and its notice are on a surface. Pure and
 * plain: the graphical drawing reads it, and so does the snapshot that holds it across surfaces.
 * The footer is decided by the buttons' view model (`@agents/kit-buttons/model.ts`), which
 * says what is lit and what goes quiet while Close asks. A frame has one lit button: the head's
 * own actions come first, so the footer's lit one is quieted where they have one. No host imports.
 */
import { settle, view as buttonsView, type ButtonsView } from "@agents/kit-buttons/model.ts";
import { textOf, type Span } from "@agents/kit-core/lines.ts";
import { holds, type Surface } from "@agents/kit-core/surfaces.ts";
import type { Frame, StoryBody, StorySlots } from "./contract.ts";

/** What a screen of the frame is, whatever its width and its body. */
export type FrameModel<Body = StoryBody> = Omit<
  Frame<{ [K in keyof StorySlots]: K extends "body" ? Body : StorySlots[K] }>,
  "width"
>;

/** Close on a surface: its own control, the host's, or the question it asks. */
export type CloseView = "control" | "host" | "question";

export type FrameView = {
  head: {
    /** The title as a heading; left out where the host draws it, or a terminal's caption stands in its place. */
    title: string | undefined;
    caption: string;
    close: CloseView;
    /** Discard and Keep, while Close asks. */
    question: ButtonsView | undefined;
    /** The pane's own actions in the head: where there is a toolbar line, and not while Close asks. */
    actions: ButtonsView | undefined;
  };
  /** The footer's buttons, with the one lit and the quiet decided. */
  footer: ButtonsView;
  /** What the notice says. */
  notice: string;
};

const words = (spans: readonly Span[] | undefined) => textOf({ spans: [...(spans ?? [])] });

export function view(model: FrameModel<unknown>, surface: Surface): FrameView {
  const isCells = holds(surface, "cells");
  const asks = !!model.close?.confirming;
  const hasCaption = (model.caption?.length ?? 0) > 0;
  const keep = model.close?.keep ?? "esc";
  // One lit button for the whole screen: the head's actions and the footer's rows are settled together.
  const [acts = [], ...footer] = settle([model.actions ?? [], ...(model.footer ?? [])], asks);
  return {
    head: {
      title: isCells
        ? hasCaption
          ? undefined
          : model.title
        : model.title && model.title !== model.hostTitle
          ? model.title
          : undefined,
      caption: words(model.caption),
      close: asks ? "question" : isCells ? "control" : "host",
      question: asks
        ? buttonsView(
            {
              rows: [
                [
                  { hotkey: "enter", label: "Discard", hit: "frame:discard", essential: true },
                  { hotkey: keep, label: "Keep", hit: "frame:keep", essential: true },
                ],
              ],
              confirming: true,
            },
            surface,
          )
        : undefined,
      actions:
        !isCells && !asks && acts.length ? buttonsView({ rows: [acts] }, surface) : undefined,
    },
    footer: buttonsView({ rows: footer, confirming: asks }, surface),
    notice: words(model.notice),
  };
}
