// The repo's content, read from its sources; shared by the README generator and the site. Run by
// node as it stands: no enums or other syntax Node's type stripping can't erase.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { type Bundle as BundleSpec, membersOf, readBundles } from "./bundles.ts";
import { isSemver, tagName, tierOf, type Tier } from "./version.ts";

export type { Tier };

export const SITE_URL = "https://nickolaj-jepsen.github.io/agents";
export const REPO_URL = "https://github.com/nickolaj-jepsen/agents";

export type Harness = "claude" | "pi";
export type Video = {
  mp4: string;
  poster: string;
  caption: string;
  harness: Harness;
  width: number;
  height: number;
};
/** Where a picture was taken: the harness in a terminal, or Claude Code's VS Code extension. */
export type Surface = "terminal" | "vscode";
export type Still = {
  png: string;
  caption: string;
  harness: Harness;
  surface: Surface;
  width: number;
  height: number;
};
/**
 * A plugin's demos (one per harness, the first shown first) and stills: the terminal's from the
 * `media.json` each app's `media` task writes, then VS Code's from the `media-vscode.json` of
 * its `media:vscode`. Not committed: the Pages workflow records them before it builds.
 */
export type Media = { videos: Video[]; stills: Still[] };

export type Plugin = {
  name: string;
  /** The one version (`version` in its package.json). */
  version: string;
  /** Its `CHANGELOG.md`, repo-relative, when it ships one. */
  changelog?: string;
  tagline: string;
  featured: boolean;
  requires: string[];
  order: number;
  /** How finished it is, read from the version: an unfinished one is listed last, under a notice. */
  tier: Tier;
  harness: { claude: boolean; pi: boolean };
  install: { claude?: string; pi?: string };
  body: string;
  path: string;
  media?: Media;
};

export type Skill = {
  name: string;
  /** The one version (`metadata.version` in its SKILL.md). */
  version: string;
  description: string;
  summary: string;
  category: string;
  /** How finished it is, read from the version: an unfinished one is listed last in its category. */
  tier: Tier;
  credit?: string;
  argumentHint?: string;
  install: string[];
  /** The same install at its release tag: what pins a skill to the version it shows. */
  pinnedInstall: string;
  /** Its `CHANGELOG.md`, repo-relative, when it keeps one. */
  changelog?: string;
  /** The skills it reads or loads (`metadata.uses`), which a bundle installs with it. */
  uses: string[];
  /** The bundles that install it, by name. */
  bundles: string[];
  body: string;
  path: string;
  files: string[];
  /** Lines in SKILL.md, frontmatter included: the page counts what it offers to open. */
  lines: number;
};

export type Category = { slug: string; title: string; blurb?: string; skills: Skill[] };

/** A named set of skills installed together (bundles.ts), with the ways to install it. */
export type Bundle = BundleSpec & {
  /** Every skill it installs, in name order. */
  members: string[];
  install: { claude: string; skills: string; pi: string };
};
export type Doc = { slug: string; title: string; body: string; path: string };
/** The constants both readers print, carried with the model so neither imports this module. */
export type Meta = {
  repoUrl: string;
  siteUrl: string;
  inProgress: string;
  marketplaceAdd: string;
};
export type Content = {
  meta: Meta;
  intro: string;
  install: string;
  plugins: Plugin[];
  skills: Skill[];
  bundles: Bundle[];
  categories: Category[];
  docs: Doc[];
};

/** The skill categories in display order. An unfinished skill (0.0.x) stays in its own, listed last. */
export const CATEGORIES: { slug: string; title: string; blurb?: string }[] = [
  { slug: "plan-build-ship", title: "Plan, build and ship" },
  { slug: "understand-decide", title: "Understand and decide" },
  { slug: "clean-up", title: "Clean up" },
  {
    slug: "harnesses",
    title: "Harnesses",
    blurb: "Each starts the real program and drives it with keys, screenshots and logs.",
  },
  { slug: "utilities", title: "Utilities" },
  {
    slug: "modified-public",
    title: "Modified public skills",
    blurb: "My variants of public skills. Prefer the originals.",
  },
];

/** What an unfinished plugin or skill (0.0.x) says about itself. */
export const IN_PROGRESS = "Unfinished, and not ready for anyone else to use.";

/**
 * Where the skills CLI installs a skill from: the `dist` branch, which holds each skill at its
 * released version. Without the `#dist` the CLI reads main, where an edit has no version yet.
 * Quoted, because zsh's extended globbing reads a bare `#`.
 */
export const SKILLS_REPO = "nickolaj-jepsen/agents";
export const SKILLS_SOURCE = `'${SKILLS_REPO}#dist'`;

/** Adds the marketplace once per machine; a plugin's Claude install runs it first. */
export const MARKETPLACE_ADD = "claude plugin marketplace add nickolaj-jepsen/agents";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function frontmatter(file: string): { data: Record<string, any>; body: string; lines: number } {
  const text = readFileSync(file, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error(`${file}: no frontmatter`);
  const data = parse(m[1] as string) ?? {};
  return {
    data,
    body: text.slice(m[0].length).replace(/^\n+/, ""),
    lines: text.trimEnd().split("\n").length,
  };
}

function dirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function str(file: string, data: Record<string, any>, key: string): string {
  const v = data[key];
  if (typeof v !== "string" || v === "")
    throw new Error(`${file}: frontmatter \`${key}\` must be a non-empty string`);
  return v;
}

/** A version is one semver string, wherever it is written. */
function version(file: string, value: unknown, field: string): string {
  if (!isSemver(value)) throw new Error(`${file}: ${field} must be a semver version`);
  return value;
}

/** `status` was a flag kept by hand; the version says it now (`tierOf`). */
function noStatus(file: string, data: Record<string, unknown>, field: string): void {
  if (data.status !== undefined)
    throw new Error(
      `${file}: drop ${field}: the version says how finished it is (0.0.x is unfinished, below 1.0.0 a pre-release)`,
    );
}

function readMedia(root: string, name: string): Media | undefined {
  const read = (file: string) => {
    const path = join(root, "apps/site/media", name, file);
    return existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8")) as Partial<Media>)
      : undefined;
  };
  // Two recorders, each in a derivation of its own, so each writes a manifest of its own.
  const terminal = read("media.json");
  const vscode = read("media-vscode.json");
  if (!terminal && !vscode) return undefined;
  return {
    videos: terminal?.videos ?? [],
    stills: [
      ...(terminal?.stills ?? []).map((s) => ({ ...s, surface: "terminal" as const })),
      ...(vscode?.stills ?? []).map((s) => ({
        ...s,
        harness: "claude" as const,
        surface: "vscode" as const,
      })),
    ],
  };
}

function loadPlugins(root: string): Plugin[] {
  const marketplace = existsSync(join(root, ".claude-plugin/marketplace.json"))
    ? (JSON.parse(readFileSync(join(root, ".claude-plugin/marketplace.json"), "utf8")) as {
        plugins: { name: string }[];
      })
    : { plugins: [] };
  const listed = new Set(marketplace.plugins.map((p) => p.name));
  return dirs(join(root, "apps"))
    .flatMap((name): Plugin[] => {
      const dir = join(root, "apps", name);
      const pkgFile = join(dir, "package.json");
      const pkg = existsSync(pkgFile)
        ? (JSON.parse(readFileSync(pkgFile, "utf8")) as Record<string, unknown>)
        : {};
      const harness = {
        claude: "claude" in pkg,
        pi: "pi" in pkg,
      };
      // An app that is neither (the site) is not a plugin.
      if (!harness.claude && !harness.pi) return [];
      // `"private": true` is the unreleased state: it is dropped before it becomes a plugin, so it
      // has no page, no home-page row and no README count, and the marketplace must not list it.
      if (pkg.private === true) return [];
      const pluginVersion = version(pkgFile, pkg.version, "`version`");
      const file = join(dir, "README.md");
      const { data, body } = frontmatter(file);
      if (
        !Array.isArray(data.requires ?? []) ||
        typeof data.featured !== "boolean" ||
        !Number.isInteger(data.order)
      )
        throw new Error(
          `${file}: frontmatter needs \`featured\` (boolean), \`requires\` (list) and \`order\` (integer)`,
        );
      noStatus(file, data, "`status`");
      const install: Plugin["install"] = {};
      if (harness.claude && listed.has(name))
        install.claude = `${MARKETPLACE_ADD} && claude plugin install ${name}@nickolaj-jepsen`;
      // The built package on dist, at its released version: an app's source imports the workspace.
      if (harness.pi)
        install.pi = `git clone --branch dist ${REPO_URL} && pi install ./agents/${name}`;
      const changelog = join(dir, "CHANGELOG.md");
      return [
        {
          name,
          version: pluginVersion,
          ...(existsSync(changelog) ? { changelog: `apps/${name}/CHANGELOG.md` } : {}),
          tagline: str(file, data, "tagline"),
          featured: data.featured,
          requires: (data.requires ?? []).map(String),
          order: data.order,
          tier: tierOf(pluginVersion),
          harness,
          install,
          body: body.trimEnd(),
          path: `apps/${name}`,
          media: readMedia(root, name),
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(a.tier === "unfinished") - Number(b.tier === "unfinished") ||
        a.order - b.order ||
        a.name.localeCompare(b.name),
    );
}

/** What a tool leaves in a skill's folder: never part of the skill. */
const LEFTOVERS = new Set([".turbo", "node_modules", "__pycache__", ".venv"]);

function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !LEFTOVERS.has(e.name))
    .flatMap((e) =>
      e.isDirectory() ? listFiles(join(dir, e.name), base) : [relative(base, join(dir, e.name))],
    )
    .sort();
}

function loadSkills(root: string): Skill[] {
  const known = new Set(CATEGORIES.map((c) => c.slug));
  // Only `skills/` is read. An unreleased skill sits under `unreleased/skills/`, which no path here
  // touches: its folder is the state, so moving it into `skills/` is what lists it.
  return dirs(join(root, "skills")).map((name): Skill => {
    const dir = join(root, "skills", name);
    const file = join(dir, "SKILL.md");
    const { data, body, lines } = frontmatter(file);
    const meta = (data.metadata ?? {}) as Record<string, unknown>;
    const category = meta.category;
    if (typeof category !== "string" || !known.has(category))
      throw new Error(
        `${file}: metadata.category must be one of ${CATEGORIES.map((c) => c.slug).join(", ")}`,
      );
    if (typeof meta.summary !== "string" || meta.summary === "")
      throw new Error(`${file}: metadata.summary must be a non-empty string`);
    const skillVersion = version(file, meta.version, "metadata.version");
    const uses = Array.isArray(meta.uses) ? meta.uses.map(String) : [];
    noStatus(file, meta, "`metadata.status`");
    return {
      name,
      version: skillVersion,
      description: str(file, data, "description"),
      summary: meta.summary,
      category,
      tier: tierOf(skillVersion),
      ...(typeof meta.credit === "string" ? { credit: meta.credit } : {}),
      ...(typeof data["argument-hint"] === "string" ? { argumentHint: data["argument-hint"] } : {}),
      install: [`npx skills add ${SKILLS_SOURCE} --skill ${name}`],
      // `#<tag>`, not `@<tag>`: the CLI reads `@x` as a ref only when x looks like a bare version.
      pinnedInstall: `npx skills add '${SKILLS_REPO}#${tagName(name, skillVersion)}' --skill ${name}`,
      ...(existsSync(join(dir, "CHANGELOG.md"))
        ? { changelog: `skills/${name}/CHANGELOG.md` }
        : {}),
      uses,
      bundles: [],
      body: body.trimEnd(),
      path: `skills/${name}`,
      // The changelog stays on main: it is not part of what a skill installs.
      files: listFiles(dir).filter((f) => f !== "SKILL.md" && f !== "CHANGELOG.md"),
      lines,
    };
  });
}

function loadDocs(root: string): Doc[] {
  const dir = join(root, "docs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .sort()
    .map((f): Doc => {
      const text = readFileSync(join(dir, f), "utf8");
      const m = text.match(/^# (.+)\n+/);
      if (!m) throw new Error(`docs/${f}: must start with a "# Title"`);
      return {
        slug: f.slice(0, -3),
        title: m[1] as string,
        body: text.slice(m[0].length).trimEnd(),
        path: `docs/${f}`,
      };
    });
}

function readPart(root: string, name: string): string {
  const file = join(root, "docs", name);
  return existsSync(file) ? readFileSync(file, "utf8").trim() : "";
}

/**
 * The bundles, each with its install commands; and each skill told which bundles install it. A
 * bundle the gate refuses (bundles.ts) is an error here too.
 */
function loadBundles(root: string, skills: Skill[]): Bundle[] {
  const { bundles, problems } = readBundles(root);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const byName = new Map(skills.map((s) => [s.name, s]));
  return bundles.map((b): Bundle => {
    const members = membersOf(b);
    for (const m of members) byName.get(m)?.bundles.push(b.name);
    return {
      ...b,
      members,
      install: {
        claude: `${MARKETPLACE_ADD} && claude plugin install ${b.name}@nickolaj-jepsen`,
        skills: `npx skills add ${REPO_URL}/tree/dist/${b.path}`,
        pi: `git clone --branch dist ${REPO_URL} && pi install ./agents/${b.path}`,
      },
    };
  });
}

export function loadContent(root: string = repoRoot): Content {
  const plugins = loadPlugins(root);
  const skills = loadSkills(root);
  const bundles = loadBundles(root, skills);
  const categories = CATEGORIES.map((c) => ({
    ...c,
    skills: skills
      .filter((s) => s.category === c.slug)
      .sort(
        (a, b) =>
          Number(a.tier === "unfinished") - Number(b.tier === "unfinished") ||
          a.name.localeCompare(b.name),
      ),
  })).filter((c) => c.skills.length > 0);
  return {
    meta: {
      repoUrl: REPO_URL,
      siteUrl: SITE_URL,
      inProgress: IN_PROGRESS,
      marketplaceAdd: MARKETPLACE_ADD,
    },
    intro: readPart(root, "_intro.md"),
    install: readPart(root, "_install.md"),
    plugins,
    skills,
    bundles,
    categories,
    docs: loadDocs(root),
  };
}
