// The repo's content, read from its sources; shared by the README generator and the site. Run by
// node as it stands: no enums or other syntax Node's type stripping can't erase.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

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
 * `media.json` `just site-shots` writes, then VS Code's from the `media-vscode.json` of
 * `just site-vscode`. Not committed: the Pages workflow records them before it builds.
 */
export type Media = { videos: Video[]; stills: Still[] };

export type Plugin = {
  name: string;
  tagline: string;
  featured: boolean;
  requires: string[];
  order: number;
  /** Unfinished: listed after every other plugin, flagged on its page. */
  status?: "in-progress";
  harness: { claude: boolean; pi: boolean };
  install: { claude?: string; pi?: string };
  body: string;
  path: string;
  media?: Media;
};

export type Skill = {
  name: string;
  description: string;
  summary: string;
  category: string;
  status?: "in-progress";
  credit?: string;
  argumentHint?: string;
  install: string[];
  body: string;
  path: string;
  files: string[];
  /** Lines in SKILL.md, frontmatter included: the page counts what it offers to open. */
  lines: number;
};

export type Category = { slug: string; title: string; blurb?: string; skills: Skill[] };
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
  categories: Category[];
  docs: Doc[];
};

/** The skill categories in display order. A skill marked `status: in-progress` stays in its own, listed last. */
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

/** What an in-progress plugin or skill says about itself. */
export const IN_PROGRESS = "Unfinished, and not ready for anyone else to use.";

/** Adds the marketplace once per machine; a plugin's Claude install runs it first. */
export const MARKETPLACE_ADD = "claude plugin marketplace add nickolaj-jepsen/agents";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

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

function readMedia(root: string, name: string): Media | undefined {
  const read = (file: string) => {
    const path = join(root, "site/media", name, file);
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
  return dirs(join(root, "plugins"))
    .map((name): Plugin => {
      const dir = join(root, "plugins", name);
      const file = join(dir, "README.md");
      const { data, body } = frontmatter(file);
      const pkgFile = join(dir, "package.json");
      const pkg = existsSync(pkgFile)
        ? (JSON.parse(readFileSync(pkgFile, "utf8")) as Record<string, unknown>)
        : {};
      const harness = {
        claude: existsSync(join(dir, ".claude-plugin/plugin.json")),
        pi: "pi" in pkg,
      };
      if (
        !Array.isArray(data.requires ?? []) ||
        typeof data.featured !== "boolean" ||
        !Number.isInteger(data.order) ||
        (data.status !== undefined && data.status !== "in-progress")
      )
        throw new Error(
          `${file}: frontmatter needs \`featured\` (boolean), \`requires\` (list) and \`order\` (integer); \`status\` may only be \`in-progress\``,
        );
      const install: Plugin["install"] = {};
      if (harness.claude && listed.has(name))
        install.claude = `${MARKETPLACE_ADD} && claude plugin install ${name}@nickolaj-jepsen`;
      if (harness.pi) install.pi = `git clone ${REPO_URL} && pi install ./agents/plugins/${name}`;
      return {
        name,
        tagline: str(file, data, "tagline"),
        featured: data.featured,
        requires: (data.requires ?? []).map(String),
        order: data.order,
        ...(data.status === "in-progress" ? { status: "in-progress" as const } : {}),
        harness,
        install,
        body: body.trimEnd(),
        path: `plugins/${name}`,
        media: readMedia(root, name),
      };
    })
    .sort(
      (a, b) =>
        Number(!!a.status) - Number(!!b.status) ||
        a.order - b.order ||
        a.name.localeCompare(b.name),
    );
}

function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? listFiles(join(dir, e.name), base) : [relative(base, join(dir, e.name))],
    )
    .sort();
}

function loadSkills(root: string): Skill[] {
  const known = new Set(CATEGORIES.map((c) => c.slug));
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
    return {
      name,
      description: str(file, data, "description"),
      summary: meta.summary,
      category,
      ...(meta.status === "in-progress" ? { status: "in-progress" as const } : {}),
      ...(typeof meta.credit === "string" ? { credit: meta.credit } : {}),
      ...(typeof data["argument-hint"] === "string" ? { argumentHint: data["argument-hint"] } : {}),
      install: [`npx skills add nickolaj-jepsen/agents --skill ${name}`],
      body: body.trimEnd(),
      path: `skills/${name}`,
      files: listFiles(dir).filter((f) => f !== "SKILL.md"),
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

export function loadContent(root: string = repoRoot): Content {
  const plugins = loadPlugins(root);
  const skills = loadSkills(root);
  const categories = CATEGORIES.map((c) => ({
    ...c,
    skills: skills
      .filter((s) => s.category === c.slug)
      .sort((a, b) => Number(!!a.status) - Number(!!b.status) || a.name.localeCompare(b.name)),
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
    categories,
    docs: loadDocs(root),
  };
}
