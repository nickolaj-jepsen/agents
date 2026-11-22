/** The list's graphical stories: the props of `stories.ts`, drawn by `gui.tsx`. */
import type { GuiStories } from "@agents/kit-core/paint/gui.tsx";
import { blocks } from "@agents/kit-core/paint/gui.tsx";
import { buttonRow } from "@agents/kit-buttons/gui.tsx";
import { detail } from "@agents/kit-detail/gui.tsx";
import { list } from "./gui.tsx";
import { GROUPS, MENU, many } from "./stories.ts";

const more = { isAll: false, hit: "more" };

export const listGuiStories: GuiStories = {
  groups: (g) => {
    // The keyboard's row, opened in place: its detail and what to do with it under its text.
    const open = GROUPS[1]?.rows[0]?.hit ?? "";
    const under = blocks(
      g,
      detail(g, {
        meta: "wrong · seen 3× · 2 days ago",
        sections: [
          { heading: "Evidence", text: "The path projection resolves only `HOME` and `PWD`." },
        ],
      }),
      buttonRow(g, [
        { hotkey: "", label: "apply", hit: "apply" },
        { hotkey: "", label: "dismiss", hit: "dismiss" },
      ]),
    );
    return list(g, { groups: GROUPS, aside: 3 }, { opened: { [open]: under } });
  },
  window: (g) => list(g, { groups: many(13), lines: 1 }, { more, maxItems: 3 }),
  wrapped: (g) => list(g, { groups: GROUPS, aside: 3, lines: 2 }),
  spaced: (g) => list(g, { groups: GROUPS, aside: 3, space: true }),
  bare: (g) => list(g, { groups: GROUPS, aside: 3, rail: false, space: true, lines: 2 }),
  menu: (g) => list(g, { groups: MENU, rail: false }),
};
