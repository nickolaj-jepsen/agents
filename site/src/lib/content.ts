/**
 * The repo's content for the pages: `scripts/content.ts` read once per build, plus the URLs the
 * pages link with. The loader is given the repo root, since the bundle runs from elsewhere.
 */
import {
  loadContent,
  REPO_URL,
  type Content,
  type Doc,
  type Plugin,
  type Skill,
} from "../../../scripts/content.ts";

export type { Content, Doc, Plugin, Skill };
export { REPO_URL };

let cached: Content | undefined;
export function content(): Content {
  cached ??= loadContent(__REPO_ROOT__);
  return cached;
}

const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");

/** A site path (`plugins/answer/`) as a URL under the base (`/agents/plugins/answer/`). */
export const href = (path = ""): string => base + path.replace(/^\//, "");

/** A repo-relative media path (`site/media/answer/demo.mp4`) as its URL. */
export const mediaUrl = (path: string): string => href(path.replace(/^site\//, ""));

export const pluginHref = (name: string) => href(`plugins/${name}/`);
export const skillHref = (name: string) => href(`skills/${name}/`);
export const docHref = (slug: string) => href(`dev/${slug}/`);

/** A repo path on GitHub: `tree` for a folder (trailing slash or none given), else `blob`. */
export function github(path: string, folder = path.endsWith("/")): string {
  return `${REPO_URL}/${folder ? "tree" : "blob"}/main/${path.replace(/\/$/, "")}`;
}

export const HARNESS = { claude: "Claude Code", pi: "pi" } as const;
export type Harness = keyof typeof HARNESS;

export function harnesses(p: Plugin): Harness[] {
  return (["claude", "pi"] as const).filter((h) => p.harness[h]);
}

/** The body less a first paragraph that only repeats the tagline. */
export function bodyAfterTagline(p: Plugin): string {
  const squash = (s: string) => s.replace(/\s+/g, " ").trim();
  const [first, ...rest] = p.body.split(/\n\s*\n/);
  return first !== undefined && squash(first) === squash(p.tagline) ? rest.join("\n\n") : p.body;
}
