/** The fixture's view model: pure, and what every surface draws from. */
import { holds, type Surface } from "@agents/kit-core/surfaces.ts";
import type { Row } from "./contract.ts";

export function view(row: Row, surface: Surface) {
  return {
    text: row.text,
    // The kit's pointer, only where the kit draws it.
    pointer: !!row.focused && holds(surface, "keyFocus:kit|ring"),
    bold: !!row.hovered && holds(surface, "hover:kit|painter"),
    detail: holds(surface, "window") ? (row.detailLines ?? 0) : 0,
  };
}
