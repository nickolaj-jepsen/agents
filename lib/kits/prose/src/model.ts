/**
 * Prose's view model: whether a passage is drawn whole, folded to its first line or opened. Pure
 * and plain: the graphical drawing reads it, and so does the snapshot that holds it across
 * surfaces. No host imports.
 */
import { cellWidth } from "@agents/kit-core/lines.ts";
import { holds, type Surface } from "@agents/kit-core/surfaces.ts";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { Prose } from "./contract.ts";

/** What a screen of the prose is, whatever its width. */
export type ProseModel = Omit<Prose, "width">;

export type ProseView = {
  /**
   * `whole`: every block, set by the surface. `folded`: the first line, dim and cut, with a
   * `More` beside it. `opened`: the whole passage in a panel with `Less`.
   */
  shape: "whole" | "folded" | "opened";
  isDim: boolean;
  /** The first line of a folded passage, its line breaks as spaces. */
  first: string | undefined;
};

/** A passage of one short line is never folded: there is nothing to give way. */
const isLong = (text: string) => text.includes("\n") || cellWidth(text) > tokens.gui.excerptCells;

export function view(model: ProseModel, surface: Surface): ProseView {
  const isFolded = !holds(surface, "cells") && model.excerpt !== undefined && isLong(model.text);
  const shape = !isFolded ? "whole" : model.excerpt?.isOpen ? "opened" : "folded";
  return {
    shape,
    isDim: !!model.isDim,
    first: shape === "folded" ? model.text.replace(/\s*\n\s*/g, " ") : undefined,
  };
}
