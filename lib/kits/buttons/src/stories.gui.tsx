/** The button row's graphical stories: the props of `stories.ts`, drawn by `gui.tsx`. */
import type { GuiStories } from "@agents/kit-core/paint/gui.tsx";
import { buttonRow } from "./gui.tsx";
import { KEYS, LEAD } from "./stories.ts";

export const buttonGuiStories: GuiStories = {
  row: (g) => buttonRow(g, KEYS) ?? <g.els.Box />,
  wrap: (g) => buttonRow(g, KEYS, { lead: LEAD }) ?? <g.els.Box />,
};
