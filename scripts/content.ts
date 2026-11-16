// The repo's content, read from its sources: each plugin's README.md, each skill's SKILL.md and docs/*.md.
// Shared by the README generator and the site. Run by node as it stands, so no enums or other
// syntax Node's type stripping can't erase.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

export const SITE_URL = "https://nickolaj-jepsen.github.io/agents";
export const REPO_URL = "https://github.com/nickolaj-jepsen/agents";

export type Media = {
  video?: { mp4: string; poster: string; caption: string; width: number; height: number };
  stills: {
    png: string;
    caption: string;
    harness: "claude" | "pi";
    width: number;
    height: number;
  }[];
};

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
};

export type Category = { slug: string; title: string; blurb?: string; skills: Skill[] };
export type Doc = { slug: string; title: string; body: string; path: string };
export type Content = {
  intro: string;
  install: string;
  plugins: Plugin[];
  skills: Skill[];
  categories: Category[];
  docs: Doc[];
};

/** The skill categories in display order; `in-progress` collects every skill marked `status: in-progress`. */
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
  {
    slug: "in-progress",
    title: "In progress",
    blurb: "Unfinished, and not ready for anyone else to use.",
  },
];

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function frontmatter(file: string): { data: Record<string, any>; body: string } {
  const text = readFileSync(file, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error(`${file}: no frontmatter`);
  const data = parse(m[1] as string) ?? {};
  return { data, body: text.slice(m[0].length).replace(/^\n+/, "") };
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
  const file = join(root, "site/media", name, "media.json");
  if (!existsSync(file)) return undefined;
  const m = JSON.parse(readFileSync(file, "utf8")) as Partial<Media>;
  return { video: m.video, stills: m.stills ?? [] };
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
        install.claude = `claude plugin install ${name}@nickolaj-jepsen`;
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
    const { data, body } = frontmatter(file);
    const meta = (data.metadata ?? {}) as Record<string, unknown>;
    const category = meta.category;
    if (typeof category !== "string" || !known.has(category) || category === "in-progress")
      throw new Error(
        `${file}: metadata.category must be one of ${CATEGORIES.slice(0, -1)
          .map((c) => c.slug)
          .join(", ")}`,
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
      install: [`npx skills add ${REPO_URL}/tree/main/skills/${name}`],
      body: body.trimEnd(),
      path: `skills/${name}`,
      files: listFiles(dir).filter((f) => f !== "SKILL.md"),
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
  const slugOf = (s: Skill) => (s.status === "in-progress" ? "in-progress" : s.category);
  const categories = CATEGORIES.map((c) => ({
    ...c,
    skills: skills.filter((s) => slugOf(s) === c.slug),
  })).filter((c) => c.skills.length > 0);
  return {
    intro: readPart(root, "_intro.md"),
    install: readPart(root, "_install.md"),
    plugins,
    skills,
    categories,
    docs: loadDocs(root),
  };
}
