/**
 * The site's collections: the repo's content and the UI kit's catalogue, each read from its sources
 * by a loader (src/loaders/) and typed by the model it reads. The pages read them through
 * src/lib/content.ts and src/lib/catalog.ts.
 */
import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import type { Doc, Meta, Plugin, Skill } from "../../../lib/tools/build/content.ts";
import type { Pictures } from "../../../lib/kits/catalog/src/crops.ts";
import type { ComponentModel } from "../../../lib/kits/catalog/src/model.ts";
import { contentLoader } from "./loaders/content.ts";
import { kitLoader, type Render } from "./loaders/kit.ts";
import type { Positioned } from "./loaders/sync.ts";

/** A category names its skills, in the order the home page lists them. */
type Category = { slug: string; title: string; blurb?: string; skills: string[] } & Positioned;
type Component = Omit<ComponentModel, "stories"> &
  Positioned & {
    stories: (ComponentModel["stories"][number] & {
      shots: Record<string, Render[]>;
      gui: Pictures[string];
    })[];
  };

export const collections = {
  plugins: defineCollection({
    loader: contentLoader("plugins"),
    schema: z.custom<Plugin & Positioned>(),
  }),
  skills: defineCollection({
    loader: contentLoader("skills"),
    schema: z.custom<Skill & Positioned>(),
  }),
  categories: defineCollection({
    loader: contentLoader("categories"),
    schema: z.custom<Category>(),
  }),
  docs: defineCollection({ loader: contentLoader("docs"), schema: z.custom<Doc & Positioned>() }),
  site: defineCollection({
    loader: contentLoader("site"),
    schema: z.custom<{ meta: Meta; intro: string; install: string } & Positioned>(),
  }),
  components: defineCollection({ loader: kitLoader(), schema: z.custom<Component>() }),
};
