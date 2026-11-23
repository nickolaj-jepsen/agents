/**
 * Every story of the kit's components, by the package that owns it. The catalogue draws them all;
 * `turbo run kit-new` adds a component here. No host imports.
 */
import buttonsManifest from "@agents/kit-buttons/manifest.ts";
import { buttonStories } from "@agents/kit-buttons/stories.ts";
import cardManifest from "@agents/kit-card/manifest.ts";
import { cardStories } from "@agents/kit-card/stories.ts";
import frameManifest from "@agents/kit-frame/manifest.ts";
import { frameStories } from "@agents/kit-frame/stories.ts";
import listManifest from "@agents/kit-list/manifest.ts";
import { listStories } from "@agents/kit-list/stories.ts";
import detailManifest from "@agents/kit-detail/manifest.ts";
import { detailStories } from "@agents/kit-detail/stories.ts";
import fieldsManifest from "@agents/kit-fields/manifest.ts";
import { fieldsStories } from "@agents/kit-fields/stories.ts";
import proseManifest from "@agents/kit-prose/manifest.ts";
import { proseStories } from "@agents/kit-prose/stories.ts";
import sheetManifest from "@agents/kit-sheet/manifest.ts";
import { sheetStories } from "@agents/kit-sheet/stories.ts";
import noticeManifest from "@agents/kit-notice/manifest.ts";
import { noticeLineStories } from "@agents/kit-notice/stories.ts";
import bandManifest from "@agents/kit-band/manifest.ts";
import { statusBandStories } from "@agents/kit-band/stories.ts";
import imageManifest from "@agents/kit-image/manifest.ts";
import { imageStories } from "@agents/kit-image/stories.ts";
import type { ComponentV2 } from "@agents/kit-core/manifest.ts";
import type { KitStory, StageExt, Story } from "@agents/kit-core/stories.ts";
import { foundationStories } from "./foundation.ts";
import { drawnOn } from "./schema2.ts";
import { terminal2 } from "./terminal2.ts";

/**
 * The stories of components on schema 2: plain data (`<component>/src/stories.ts`), drawn by every
 * surface the manifest says (`terminal2.ts` for the terminals, `adapters.tsx` for the graphical
 * clients).
 */
export const kitStories2: Story[] = [
  ...(buttonStories as Story[]),
  ...(frameStories as Story[]),
  ...(sheetStories as Story[]),
  ...(listStories as Story[]),
  ...(detailStories as Story[]),
  ...(fieldsStories as Story[]),
  ...(cardStories as Story[]),
  ...(noticeLineStories as Story[]),
  ...(statusBandStories as Story[]),
  ...(proseStories as Story[]),
  ...(imageStories as Story[]),
];

const manifests2: readonly ComponentV2[] = [
  buttonsManifest,
  frameManifest,
  sheetManifest,
  listManifest,
  detailManifest,
  fieldsManifest,
  cardManifest,
  noticeManifest,
  bandManifest,
  proseManifest,
  imageManifest,
];

/** Attach the manifest-derived surfaces and the terminal drawing to the data story. */
const asKit = (s: Story): KitStory => {
  const t = (s.ext?.terminal ?? {}) as StageExt;
  const manifest = manifests2.find((m) => m.id === s.component);
  const surfaces = manifest ? drawnOn(manifest, `${s.component}/${s.state}`) : [];
  return {
    component: s.component,
    state: s.state,
    about: s.about,
    settings: s.settings,
    extreme: t.extreme,
    ...(s.isLive ? { isLive: true as const } : {}),
    width: t.stage,
    surfaces,
    lines: (width) => terminal2[s.component]?.(s, width) ?? [],
  };
};

const of2 = (component: string): KitStory[] =>
  kitStories2.filter((s) => s.component === component).map(asKit);

/** Component package (`lib/kits/<name>`) to its stories. */
export const kitPackages: Record<string, KitStory[]> = {
  buttons: of2("button-row"),
  card: of2("card"),
  detail: of2("item-detail"),
  fields: of2("fields"),
  frame: of2("caption-frame"),
  list: of2("grouped-list"),
  prose: of2("prose"),
  sheet: of2("sheet"),
  notice: of2("notice-line"),
  band: of2("status-band"),
  image: of2("image-gallery"),
};

export const kitStories: KitStory[] = [
  ...of2("card"),
  ...of2("button-row"),
  ...of2("caption-frame"),
  ...of2("grouped-list"),
  ...of2("item-detail"),
  ...of2("fields"),
  ...of2("prose"),
  ...of2("sheet"),
  ...of2("notice-line"),
  ...of2("status-band"),
  ...of2("image-gallery"),
];

/**
 * What the Claude catalogue mod draws: the kit's stories, and the design foundation's, which are
 * not a component's and have no snapshot of their own.
 */
export const catalogueStories: KitStory[] = [...kitStories, ...foundationStories];
