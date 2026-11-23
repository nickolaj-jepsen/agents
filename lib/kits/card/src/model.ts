/**
 * The question card's view model: what each of its parts is on a surface. Pure and plain: the
 * graphical drawing reads it, and so does the snapshot that holds it across surfaces. No host imports.
 */
import { holds, type Surface } from "@agents/kit-core/surfaces.ts";
import type { Card } from "./contract.ts";

/** What a screen of the card is, whatever its width. */
export type CardModel = Omit<Card, "width">;

/** How a part is drawn: `cells` on a terminal, the others on a graphical surface. */
export type CardView = {
  choices:
    | {
        /** The mark and the letter: a pointer, `○` and the key in cells; an icon and the key's Button. */
        lead: "cells" | "icon-button";
        /** The rail that ties the answers together: the caller's on a terminal; none otherwise (see `choices`). */
        rail: "caller" | "none";
        /** A write-in is the host's field, or words where the surface draws none. */
        write: "field" | "text";
      }
    | undefined;
  /** The note: a panel holding a full-width field, or words where there is no field. */
  note: "cells" | "panel" | "text" | undefined;
  /** The steps: one row in cells, tabs with the current one a label and not a button. */
  steps: "cells" | "tabs" | undefined;
  /** Each answer in review: a line in cells, or a label column and its words. */
  summaries: "cells" | "labels" | undefined;
};

export function view(model: CardModel, surface: Surface): CardView {
  const isCells = holds(surface, "cells");
  const hasInput = holds(surface, "input");
  return {
    choices: model.choices
      ? {
          lead: isCells ? "cells" : "icon-button",
          rail: isCells ? "caller" : "none",
          write: isCells || hasInput ? "field" : "text",
        }
      : undefined,
    note: model.note ? (isCells ? "cells" : hasInput ? "panel" : "text") : undefined,
    steps: model.steps ? (isCells ? "cells" : "tabs") : undefined,
    summaries: model.summaries ? (isCells ? "cells" : "labels") : undefined,
  };
}
