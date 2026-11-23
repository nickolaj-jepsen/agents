/**
 * The Claude catalogue's stories as data, one per kit component per state, so `build.ts` and the
 * scenarios can read them under plain Node. They are the kit's own stories (`kit/stories.ts`),
 * from the mod's copy of them: a mod cannot import outside its folder. What the terminal draws
 * is `claude/render.tsx`, keyed by `<component>/<state>`.
 */

import type { Surface } from "@agents/kit-core/surfaces.ts";
import { catalogueStories } from "../registry.ts";

export type Story = {
  /** `<component>/<state>`'s first half: `list` for `list/grouped`. */
  component: string;
  state: string;
  about: string;
  /** What was passed to the component, shown as the caption. */
  settings?: string;
  /** Snapshot at four sizes, for the state with the most text. */
  extreme?: boolean;
  /** Which surfaces draw this story. */
  surfaces: readonly Surface[];
  /** The width class the stage caps the component at. */
  width: "reading" | "dialog";
};

export const storyId = (s: Pick<Story, "component" | "state">) => `${s.component}/${s.state}`;

export const stories: Story[] = catalogueStories.map((s) => ({
  component: s.component,
  state: s.state,
  about: s.about,
  settings: s.settings ?? "",
  extreme: s.extreme,
  surfaces: s.surfaces,
  width: s.width ?? "reading",
}));

/**
 * The stage's width on a pane `columns` wide: the story's class as a cap (the kit's
 * `widthCap`, restated because the scenarios read this file under plain Node).
 */
export const stageWidth = (s: Pick<Story, "width">, columns: number) =>
  Math.max(1, Math.min(columns, { reading: 96, dialog: 72 }[s.width]));
