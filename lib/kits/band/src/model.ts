/**
 * The band's view model: its mark, its words and how its buttons stand. Pure and plain: the
 * graphical drawing reads it, and so does the snapshot that holds it across surfaces. A
 * terminal's band is one line that is one control, so it has no buttons and no mark of its own.
 * No host imports.
 */
import type { MeaningName } from "@agents/kit-core/icons.ts";
import { holds, type Surface } from "@agents/kit-core/surfaces.ts";
import type { StatusBand, StatusBandAction } from "./contract.ts";
import { statusMeaning } from "./internal.ts";

/** What a screen of the band is, whatever its width. */
export type StatusBandModel = Omit<StatusBand, "width">;

export type StatusBandView = {
  /** The icon before the words, where the surface draws icons. */
  mark: MeaningName | undefined;
  /** The line's words. */
  text: string;
  /** The way in, and each further action: all quiet, so the prompt's send stays the one lit control. */
  buttons: { label: string; hit: string }[];
  /** Whether the buttons stand after the words or wrap under them. */
  layout: "line" | "stacked";
};

const capital = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

export function view(model: StatusBandModel, surface: Surface): StatusBandView {
  if (holds(surface, "cells"))
    return { mark: undefined, text: model.text, buttons: [], layout: "line" };
  const actions: readonly StatusBandAction[] = model.actions ?? [];
  return {
    mark: model.mark ?? statusMeaning(model.status ?? "warning"),
    text: model.words ?? model.text,
    buttons: [{ label: capital(model.hint), hit: model.hit }, ...actions].map((b) => ({
      label: capital(b.label),
      hit: b.hit,
    })),
    layout: actions.length === 0 || model.isOneLine ? "line" : "stacked",
  };
}
