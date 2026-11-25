/**
 * The repo's content as collections, read from the sources by `lib/tools/build/content.ts`, the
 * model the README generator reads too: the plugins (an app's package.json and README), skills,
 * docs, the marketplace and the media manifests the recorders leave under `apps/site/media/`.
 * One loader per collection; each reads the model whole and keeps its part. Nothing here fails a
 * build for missing media: it is warned about, and the pages show what there is.
 */
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { Loader } from "astro/loaders";
import { type Content, loadContent, repoRoot } from "../../../../lib/tools/build/content.ts";
import { put, readAndWatch } from "./sync.ts";

export type Part = "plugins" | "skills" | "categories" | "docs" | "site";

type Entries = Map<string, Record<string, unknown>>;

const parts: Record<Part, (c: Content) => Entries> = {
  plugins: (c) => new Map(c.plugins.map((p) => [p.name, { ...p }])),
  skills: (c) => new Map(c.skills.map((s) => [s.name, { ...s }])),
  // A category names its skills, in the order the home page lists them.
  categories: (c) =>
    new Map(
      c.categories.map((cat) => [
        cat.slug,
        { ...cat, skills: cat.skills.map((s) => s.name) } as Record<string, unknown>,
      ]),
    ),
  docs: (c) => new Map(c.docs.map((d) => [d.slug, { ...d }])),
  site: (c) => new Map([["site", { meta: c.meta, intro: c.intro, install: c.install }]]),
};

/** The files of the sources the model reads, as paths under the checkout. */
const sources = [
  /^apps\/[^/]+\/(package\.json|README\.md|CHANGELOG\.md)$/,
  /^apps\/site\/media\/[^/]+\/media(-vscode)?\.json$/,
  /^skills\//,
  /^docs\/[^/]+\.md$/,
  /^\.claude-plugin\/marketplace\.json$/,
];

export function contentLoader(part: Part): Loader {
  return {
    name: `agents-content:${part}`,
    async load(ctx) {
      await readAndWatch(ctx, {
        dirs: ["apps", "skills", "docs", ".claude-plugin"].map((d) => join(repoRoot, d)),
        relevant: (file) => sources.some((re) => re.test(relative(repoRoot, file))),
        read: async () => {
          const content = loadContent(repoRoot);
          put(ctx, parts[part](content));
          if (part === "plugins") warnAboutMedia(content, ctx.logger.warn.bind(ctx.logger));
        },
      });
    },
  };
}

/** A manifest lists files the recorder wrote; one that is not there is a recording that did not run to the end. */
function warnAboutMedia(content: Content, warn: (message: string) => void): void {
  const bare: string[] = [];
  for (const p of content.plugins) {
    if (!p.media) {
      bare.push(p.name);
      continue;
    }
    const files = [
      ...p.media.videos.flatMap((v) => [v.mp4, v.poster]),
      ...p.media.stills.map((s) => s.png),
    ];
    for (const file of files)
      if (!existsSync(join(repoRoot, file)))
        warn(
          `${p.name}: its media manifest lists ${file}, which is not there (pnpm turbo run media)`,
        );
  }
  if (bare.length > 0)
    warn(
      `no media for ${bare.join(", ")}: their pages show none (pnpm turbo run media records it)`,
    );
}
