/**
 * The graphical drawing of every story that has one: `<component>/stories.gui.tsx` draws a
 * story's props with that component's `gui.tsx`, keyed by state. A story with a drawing here
 * says `gui: true` in `stories.ts`, which plain Node can read (this file it cannot).
 */
import type { Gui, GuiStories } from "@agents/kit-core/paint/gui.tsx";
import { cardGuiStories } from "@agents/kit-card/stories.gui.tsx";
import { fieldsGuiStories } from "@agents/kit-fields/stories.gui.tsx";
import { detailGuiStories } from "@agents/kit-detail/stories.gui.tsx";
import { listGuiStories } from "@agents/kit-list/stories.gui.tsx";
import { buttonGuiStories } from "@agents/kit-buttons/stories.gui.tsx";
import { frameGuiStories } from "@agents/kit-frame/stories.gui.tsx";
import { sheetGuiStories } from "@agents/kit-sheet/stories.gui.tsx";
import { proseGuiStories } from "@agents/kit-prose/stories.gui.tsx";
import { noticeLineGuiStories } from "@agents/kit-notice/stories.gui.tsx";
import { statusBandGuiStories } from "@agents/kit-band/stories.gui.tsx";
import { storyId } from "@agents/kit-core/stories.ts";
import { kitStories } from "./registry.ts";

const byComponent: Record<string, GuiStories> = {
  card: cardGuiStories,
  fields: fieldsGuiStories,
  prose: proseGuiStories,
  "grouped-list": listGuiStories,
  "item-detail": detailGuiStories,
  "notice-line": noticeLineGuiStories,
  "status-band": statusBandGuiStories,
  "button-row": buttonGuiStories,
  "caption-frame": frameGuiStories,
  sheet: sheetGuiStories,
};

/** The graphical drawing of a story (`<component>/<state>`), if it has one. */
export const guiStoryOf = (id: string): ((g: Gui) => JSX.Element) | undefined => {
  const story = kitStories.find((s) => storyId(s) === id);
  return story?.gui ? byComponent[story.component]?.[story.state] : undefined;
};

/** The ids of the stories that have a graphical drawing. */
export const guiStoryIds = (): string[] => kitStories.filter((s) => s.gui).map(storyId);
