/** Draw a data story on the graphical surfaces declared by its manifest. */
import type { Gui, GuiSurface } from "@agents/kit-core/paint/gui.tsx";
import { storyId } from "@agents/kit-core/stories.ts";
import { gui2 } from "./adapters.tsx";
import { catalogueStories, kitStories2 } from "./registry.ts";
import { foundationGuiStories } from "./foundation.tsx";

/** The graphical drawing of a story (`<component>/<state>`), if it has one. */
export const guiStoryOf = (
  id: string,
  surface: GuiSurface,
): ((g: Gui) => JSX.Element) | undefined => {
  const story = catalogueStories.find((s) => storyId(s) === id);
  if (!story?.surfaces.includes(surface)) return undefined;
  const data = kitStories2.find((s) => storyId(s) === id);
  const adapter = data && gui2[data.component];
  if (data && adapter) return (g) => adapter(g, data);
  return story.component === "foundation" ? foundationGuiStories[story.state] : undefined;
};

/** The ids of the stories that have a graphical drawing. */
export const guiStoryIds = (surface: GuiSurface): string[] =>
  catalogueStories.filter((s) => s.surfaces.includes(surface)).map(storyId);
