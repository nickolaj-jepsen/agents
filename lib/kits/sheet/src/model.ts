/**
 * The sheet's view model: the frame's, and where the sheet stands. Pure and plain. No host imports.
 */
import type { Button } from "@agents/kit-buttons/contract.ts";
import { view as frameView, type FrameView } from "@agents/kit-frame/model.ts";
import type { Span } from "@agents/kit-core/lines.ts";
import { holds, type Surface } from "@agents/kit-core/surfaces.ts";
import type { SheetModel } from "./contract.ts";

/** What a story's body is: a draft as the sheet shows it. */
export type SheetBody = {
  heading: string;
  fields: readonly { label: string; value: string }[];
};

/** What a story's parts are: the model's own data. */
export type SheetStorySlots = {
  body: SheetBody;
  footer: readonly (readonly Button[])[];
  notice: readonly Span[];
  head: never;
};

/** What a screen of the sheet is, whatever its width. */
export type SheetModelOf = Omit<SheetModel<SheetStorySlots>, "width">;

export type SheetView = FrameView & {
  /** Its bottom: its own edge, nothing where it stands on a rule, or the host's frame. */
  foot: "edge" | "none" | "host";
};

export function view(model: SheetModelOf, surface: Surface): SheetView {
  return {
    ...frameView(model, surface),
    foot: holds(surface, "cells") ? (model.foot ?? "edge") : "host",
  };
}
