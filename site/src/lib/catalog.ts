/**
 * The UI kit's catalogue for the /dev/components/ pages: `kit/catalog/catalog.json` (the model
 * `npm run catalog` writes) joined with the crops it keeps in `site/media/kit/crops.json`.
 */
import type { ComponentModel, Model, StoryModel } from "../../../kit/catalog/model.ts";
import type { Harness } from "../../../kit/catalog/manifest.ts";
import data from "../../../kit/catalog/catalog.json";
import cropList from "../../media/kit/crops.json";
import { href, mediaUrl } from "./content.ts";

export type { Harness };
export const HARNESSES: Harness[] = ["pi", "claude"];
export const TITLES: Record<Harness, string> = { pi: "pi", claude: "Claude Code" };
export const MARK: Record<Harness, string> = { pi: "π", claude: "C" };

/** One render of a story: the terminal size it was drawn at, and the crop's URL and pixels. */
export type Shot = { w: number; h: number; src: string; width: number; height: number };
export type Story = StoryModel & { shots: Partial<Record<Harness, Shot[]>> };
export type Component = Omit<ComponentModel, "stories"> & { stories: Story[] };

type Crop = { png: string; width: number; height: number };
const crops = cropList as Record<string, Crop>;
const model = data as unknown as Pick<Model, "kits" | "components">;

function shotsOf(h: Harness, id: string): Shot[] {
  const out: Shot[] = [];
  for (const [key, c] of Object.entries(crops)) {
    const m = /^([^/]+)\/(.+)@(\d+)x(\d+)$/.exec(key);
    if (!m || m[1] !== h || m[2] !== id) continue;
    out.push({
      w: Number(m[3]),
      h: Number(m[4]),
      src: mediaUrl(c.png),
      width: c.width,
      height: c.height,
    });
  }
  return out.sort((a, b) => a.w - b.w || a.h - b.h);
}

export const components: Component[] = model.components.map((c) => ({
  ...c,
  stories: c.stories.map((s) => ({
    ...s,
    shots: Object.fromEntries(HARNESSES.map((h) => [h, shotsOf(h, s.id)])) as Story["shots"],
  })),
}));

export const kits = model.kits;

/** The overview is `/dev/`; a component has a page; a story is an anchor on it. */
export const catalogHref = (c?: Component, s?: Story) =>
  c ? href(`dev/components/${c.id}/${s ? `#${storyAnchor(s)}` : ""}`) : href("dev/");

export const storyAnchor = (s: Story) => `s-${s.state}`;

export const sizeKey = (s: { w: number; h: number }) => `${s.w}x${s.h}`;

/** Every terminal size the stories were drawn at, narrowest first. */
export function sizesOf(stories: Story[]): { w: number; h: number }[] {
  const seen = new Map<string, { w: number; h: number }>();
  for (const s of stories)
    for (const h of HARNESSES)
      for (const x of s.shots[h] ?? []) seen.set(sizeKey(x), { w: x.w, h: x.h });
  return [...seen.values()].sort((a, b) => a.w - b.w || a.h - b.h);
}

export type Mark = "on" | "plan" | "none";
export const MARK_TEXT: Record<Mark, string> = {
  on: "has it",
  plan: "not yet",
  none: "not possible",
};

/** A component's state in a harness: implemented, planned, or not possible. */
export const implMark = (c: Component, h: Harness): Mark =>
  ({ exists: "on", planned: "plan", none: "none" })[c.impl[h].state] as Mark;

/** A story's state in a harness: rendered, not rendered yet, or not possible. */
export const storyMark = (c: Component, s: Story, h: Harness): Mark =>
  c.impl[h].state === "none" ? "none" : (s.shots[h]?.length ?? 0) > 0 ? "on" : "plan";

export const differs = (f: Component["features"][number]) =>
  f.support.pi.status !== f.support.claude.status;

/** Why a harness shows no render of a story at a size. */
export function whyNot(c: Component, s: Story, h: Harness): string {
  if (c.impl[h].state === "none") return `not possible: ${s.missing[h] ?? c.impl[h].reason ?? ""}`;
  if (!s.by[h]) return "no story yet";
  return "no render yet; run `just catalog`";
}

export const STATUS_GLYPH = {
  yes: "✓",
  partial: "~",
  no: "✗",
  planned: "○",
  exists: "✓",
  none: "✗",
} as const;
export const STATUS_LABEL = {
  yes: "yes",
  partial: "partial",
  no: "no",
  planned: "planned",
  exists: "exists",
  none: "not possible",
} as const;
export type StatusKey = keyof typeof STATUS_LABEL;
/** The colour class of a status. */
export const statusKind = (s: StatusKey) => (s === "exists" ? "yes" : s === "none" ? "no" : s);
