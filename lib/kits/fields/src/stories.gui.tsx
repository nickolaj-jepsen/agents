/** The fields' graphical stories: the props of `stories.ts`, drawn by `gui.tsx`. */
import type { GuiStories } from "@agents/kit-core/paint/gui.tsx";
import { fields } from "./gui.tsx";
import { ISSUE } from "./stories.ts";

export const fieldsGuiStories: GuiStories = {
  rows: (g) => fields(g, ISSUE),
  inline: (g) => fields(g, ISSUE, { inline: true }),
  read: (g) =>
    fields(
      g,
      ISSUE.slice(0, 3).map(({ label, value }) => ({ label, value })),
    ),
};
