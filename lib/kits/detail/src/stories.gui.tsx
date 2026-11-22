/** The detail's graphical stories: the props of `stories.ts`, drawn by `gui.tsx`. */
import type { GuiStories } from "@agents/kit-core/paint/gui.tsx";
import { detail } from "./gui.tsx";
import { ITEM, RULED } from "./stories.ts";

export const detailGuiStories: GuiStories = {
  whole: (g) => detail(g, ITEM),
  rule: (g) => detail(g, RULED),
};
