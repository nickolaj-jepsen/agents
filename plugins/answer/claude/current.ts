import type { Current } from "./types.d.ts";

/** Whether picks toggle on the shown item: as the person set it, else as its answer already is. */
export const isSeveral = (c: Current) => c.several ?? c.view.item?.isSeveral ?? false;
