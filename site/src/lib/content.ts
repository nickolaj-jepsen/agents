/**
 * The repo's content for the pages: `scripts/content.ts` read once per build, plus the URLs the
 * pages link with. The loader is given the repo root, since the bundle runs from elsewhere.
 */
import {
  IN_PROGRESS,
  loadContent,
  MARKETPLACE_ADD,
  REPO_URL,
  type Content,
  type Doc,
  type Plugin,
  type Skill,
} from "../../../scripts/content.ts";

export type { Content, Doc, Plugin, Skill };
export { IN_PROGRESS, MARKETPLACE_ADD, REPO_URL };

let cached: Content | undefined;
/** Read once per build; in dev on every page, so newly recorded media show without a restart. */
export function content(): Content {
  if (import.meta.env.DEV) return loadContent(__REPO_ROOT__);
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

/** The picture a plugin is known by: its first demo's poster, else its first still. */
export function posterOf(p: Plugin): { src: string; width: number; height: number } | undefined {
  const v = p.media?.videos[0];
  if (v) return { src: mediaUrl(v.poster), width: v.width, height: v.height };
  const s = p.media?.stills[0];
  return s && { src: mediaUrl(s.png), width: s.width, height: s.height };
}

/**
 * A plugin's pictures for the home page, one per harness that has media: the one it is known by
 * first (`posterOf`), so a visitor who has chosen a harness there sees that harness's.
 */
export function postersOf(p: Plugin): { h: Harness; src: string; width: number; height: number }[] {
  const out = harnesses(p).flatMap((h) => {
    const v = p.media?.videos.find((m) => m.harness === h);
    const s = p.media?.stills.find((m) => m.harness === h);
    const m = v ? { src: v.poster, ...v } : s && { src: s.png, ...s };
    return m ? [{ h, src: mediaUrl(m.src), width: m.width, height: m.height }] : [];
  });
  const first = p.media?.videos[0]?.harness ?? p.media?.stills[0]?.harness;
  return out.sort((a, b) => Number(b.h === first) - Number(a.h === first));
}

/** A plugin's install commands, one per harness, for the install control. */
export const pluginInstall = (p: Plugin) =>
  harnesses(p)
    .filter((h) => p.install[h])
    .map((h) => ({ h, label: HARNESS[h], command: p.install[h]! }));

/** Said under a Claude install: what the flake checks and a marketplace install doesn't. */
export const CLAUDE_NOTE =
  "Checked against Claude Code from nixpkgs master; a newer Claude Code can break it before the next check.";

/** A skill's install: one command, and the other ways behind "More ways". */
export const skillInstall = (s: Skill) => ({
  commands: s.install.map((command) => ({ command })),
  more: [
    { label: "Every skill", command: "npx skills add nickolaj-jepsen/agents" },
    {
      label: "Every skill, as a Claude Code plugin",
      command: `${MARKETPLACE_ADD} && claude plugin install skills@nickolaj-jepsen`,
    },
  ],
});
