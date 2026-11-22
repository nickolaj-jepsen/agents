/**
 * Every story of the kit's components, by the package that owns it. The catalogue draws them all;
 * `turbo run kit-new` adds a component here. No host imports.
 */
import { buttonStories } from "@agents/kit-buttons/stories.ts";
import { cardStories } from "@agents/kit-card/stories.ts";
import { frameStories } from "@agents/kit-frame/stories.ts";
import { listStories } from "@agents/kit-list/stories.ts";
import { detailStories } from "@agents/kit-detail/stories.ts";
import { fieldsStories } from "@agents/kit-fields/stories.ts";
import { proseStories } from "@agents/kit-prose/stories.ts";
import { sheetStories } from "@agents/kit-sheet/stories.ts";
import { noticeLineStories } from "@agents/kit-notice/stories.ts";
import { statusBandStories } from "@agents/kit-band/stories.ts";
import { imageStories } from "@agents/kit-image/stories.ts";
import type { KitStory } from "@agents/kit-core/stories.ts";

/** Component package (`lib/kits/<name>`) to its stories. */
export const kitPackages: Record<string, KitStory[]> = {
  buttons: buttonStories,
  card: cardStories,
  detail: detailStories,
  fields: fieldsStories,
  frame: frameStories,
  list: listStories,
  prose: proseStories,
  sheet: sheetStories,
  notice: noticeLineStories,
  band: statusBandStories,
  image: imageStories,
};

export const kitStories: KitStory[] = [
  ...cardStories,
  ...buttonStories,
  ...frameStories,
  ...listStories,
  ...detailStories,
  ...fieldsStories,
  ...proseStories,
  ...sheetStories,
  ...noticeLineStories,
  ...statusBandStories,
  ...imageStories,
];
