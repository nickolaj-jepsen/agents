/**
 * Markdown from the repo's sources to HTML: GitHub-flavoured, code in the fireproof Shiki theme,
 * and every relative link resolved against the file it came from. A link to a plugin, skill or
 * doc lands on its page here; anything else in the repo goes to GitHub, so nothing 404s.
 */
import { posix } from "node:path";
import { unified } from "@astrojs/markdown-remark";
import { fireproof } from "./fireproof.ts";
import { content, docHref, github, href, mediaUrl, pluginHref, skillHref } from "./content.ts";

type Node = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
  value?: string;
};

const SITE = "https://nickolaj-jepsen.github.io/agents/";
const RAW = "https://raw.githubusercontent.com/nickolaj-jepsen/agents/main/";

/** The names a link may land on, read before each render: a link to a plugin, skill or doc lands on its page. */
let known = { plugins: new Set<string>(), skills: new Set<string>(), docs: new Set<string>() };

async function readKnown(): Promise<void> {
  const c = await content();
  known = {
    plugins: new Set(c.plugins.map((p) => p.name)),
    skills: new Set(c.skills.map((s) => s.name)),
    docs: new Set(c.docs.map((d) => d.slug)),
  };
}

/** Where a link written in the repo file `from` should go on the site. */
export function resolveLink(target: string, from: string, image = false): string {
  if (target.startsWith(SITE)) return href(target.slice(SITE.length));
  if (/^[a-z][a-z+.-]*:|^#|^\/\//i.test(target)) return target;
  const [path = "", hash = ""] = target.split(/(?=#)/);
  const folder = path.endsWith("/") || path === "";
  const resolved = posix.normalize(posix.join(posix.dirname(from), path)).replace(/\/$/, "");
  if (image) return resolved.startsWith("apps/site/media/") ? mediaUrl(resolved) : RAW + resolved;
  let m = /^apps\/([^/]+)(?:\/README\.md)?$/.exec(resolved);
  if (m && known.plugins.has(m[1]!)) return pluginHref(m[1]!) + hash;
  m = /^skills\/([^/]+)(?:\/SKILL\.md)?$/.exec(resolved);
  if (m && known.skills.has(m[1]!)) return skillHref(m[1]!) + hash;
  m = /^docs\/([^/_][^/]*)\.md$/.exec(resolved);
  if (m && known.docs.has(m[1]!)) return docHref(m[1]!) + hash;
  if (resolved === "README.md" || resolved === ".") return href() + hash;
  return github(resolved, folder || !posix.extname(resolved)) + hash;
}

/** Rewrites the links and images of a document from `file`, and marks its scrolling blocks. */
function rehypeRepoLinks(options: { file: string }) {
  const walk = (node: Node) => {
    if (node.type === "element") {
      const props = (node.properties ??= {});
      if (node.tagName === "a" && typeof props.href === "string")
        props.href = resolveLink(props.href, options.file);
      if (node.tagName === "img" && typeof props.src === "string") {
        props.src = resolveLink(props.src, options.file, true);
        props.loading = "lazy";
      }
      // A code block scrolls inside itself; a keyboard user reaches it as a named region.
      if (node.tagName === "pre") {
        props.tabIndex = 0;
        const lang = typeof props.dataLanguage === "string" ? props.dataLanguage : undefined;
        props.ariaLabel = lang && lang !== "plaintext" ? `${lang} listing` : "listing";
      }
      if (node.tagName === "table") {
        const table = { ...node };
        node.tagName = "div";
        node.properties = { className: ["table"], tabIndex: 0, role: "region", ariaLabel: "table" };
        node.children = [table];
        for (const kid of table.children ?? []) walk(kid);
        return;
      }
    }
    for (const kid of node.children ?? []) walk(kid);
  };
  return (tree: Node) => walk(tree);
}

const renderers = new Map<string, Promise<{ render: (md: string) => Promise<{ code: string }> }>>();

function rendererFor(file: string) {
  let r = renderers.get(file);
  if (!r) {
    r = unified({ rehypePlugins: [[rehypeRepoLinks, { file }]], smartypants: true }).createRenderer(
      {
        syntaxHighlight: "shiki",
        shikiConfig: { theme: fireproof },
      },
    );
    renderers.set(file, r);
  }
  return r;
}

/** `md` as HTML; `file` is the repo path it was read from, for its relative links. */
export async function renderMarkdown(md: string, file: string): Promise<string> {
  await readKnown();
  return (await (await rendererFor(file)).render(md)).code;
}

/** One line of markdown (a credit, a requirement) as inline HTML, without the paragraph. */
export async function renderInline(md: string, file: string): Promise<string> {
  return (await renderMarkdown(md, file)).trim().replace(/^<p>([\s\S]*)<\/p>$/, "$1");
}
