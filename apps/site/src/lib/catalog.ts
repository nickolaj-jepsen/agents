/**
 * The UI kit's catalogue for the /dev/components/ pages: the `components` collection (see
 * `src/loaders/kit.ts`: the catalogue's model joined with the crops each kit package's `media` task
 * leaves in `apps/site/media/kit/<package>/`).
 */
import { getCollection } from "astro:content";
import type { ComponentModel, StoryModel } from "../../../../lib/kits/catalog/src/model.ts";
import type { Harness } from "../../../../lib/kits/core/src/manifest.ts";
import { href, mediaUrl } from "./content.ts";

export type { Harness };
/** Claude Code first, as everywhere on the site; the columns and the switch follow it. */
export const HARNESSES: Harness[] = ["claude", "pi"];
export const TITLES: Record<Harness, string> = { pi: "pi", claude: "Claude Code" };

/** One render of a story: the terminal size it was drawn at, and the crop's URL and pixels. */
export type Shot = { w: number; h: number; src: string; width: number; height: number };
export type Story = StoryModel & { shots: Partial<Record<Harness, Shot[]>> };
export type Component = Omit<ComponentModel, "stories"> & { stories: Story[] };

/** The kit's components in the order of the catalogue, with each story's renders at their URLs, smallest first. */
export async function getComponents(): Promise<Component[]> {
  const entries = await getCollection("components");
  return entries
    .map((e) => e.data)
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      ...c,
      stories: c.stories.map((s) => ({
        ...s,
        shots: Object.fromEntries(
          HARNESSES.map((h) => [
            h,
            (s.shots[h] ?? [])
              .map(({ png, ...shot }): Shot => ({ ...shot, src: mediaUrl(png) }))
              .sort((a, b) => a.w - b.w || a.h - b.h),
          ]),
        ) as Story["shots"],
      })),
    }));
}

/** The overview is `/dev/`; a component has a page; a story is an anchor on it. */
export const catalogHref = (c?: Component, s?: Story) =>
  c ? href(`dev/components/${c.id}/${s ? `#${storyAnchor(s)}` : ""}`) : href("dev/");

export const storyAnchor = (s: Story) => `s-${s.state}`;

export const sizeKey = (s: { w: number; h: number }) => `${s.w}x${s.h}`;
export const sizeLabel = (s: { w: number; h: number }) => `${s.w}×${s.h}`;

/** Every terminal size the stories were drawn at, narrowest first, with the harnesses drawn at it. */
export function sizesOf(stories: Story[]): { w: number; h: number; by: Harness[] }[] {
  const seen = new Map<string, { w: number; h: number; by: Harness[] }>();
  for (const s of stories)
    for (const h of HARNESSES)
      for (const x of s.shots[h] ?? []) {
        const k = sizeKey(x);
        const e = seen.get(k) ?? { w: x.w, h: x.h, by: [] };
        if (!e.by.includes(h)) e.by.push(h);
        seen.set(k, e);
      }
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
  return "no render yet (turbo run catalog)";
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
/** What a status means, for its tooltip. */
export const STATUS_HELP = {
  yes: "works",
  partial: "works with a caveat",
  no: "the engine cannot",
  planned: "can, not built yet",
  exists: "the kit has it",
  none: "not possible in this harness",
} as const;
export type StatusKey = keyof typeof STATUS_LABEL;
/** The colour class of a status. */
export const statusKind = (s: StatusKey) => (s === "exists" ? "yes" : s === "none" ? "no" : s);
