/** What a skill page derives from a SKILL.md: facts for people, its headings, links between them. */

export interface Heading {
  id: string;
  level: 2 | 3;
  /** The heading's HTML, as rendered. */
  html: string;
  text: string;
}

/** The sentences of a description that say when the agent uses the skill, else the description itself. */
export function whenToUse(description: string): string {
  const sentences = description.split(/(?<=[.?!])\s+(?=[A-Z])/);
  const when = sentences.filter((s) => /^Use\b/.test(s));
  return (when.length ? when : sentences).join(" ");
}

/** The bullets of a `## Requirements` section (outside code fences), each as one line of markdown. */
export function requirements(body: string): string[] {
  const out: string[] = [];
  let fence = false;
  let inside = false;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    if (/^#{1,6}\s/.test(line)) {
      inside = /^##\s+Requirements\s*$/.test(line);
      continue;
    }
    if (!inside) continue;
    if (/^[-*]\s+/.test(line)) out.push(line.replace(/^[-*]\s+/, ""));
    else if (/^\s+\S/.test(line) && out.length) out[out.length - 1] += ` ${line.trim()}`;
  }
  return out;
}

const strip = (html: string) => html.replace(/<[^>]*>/g, "");

/** The h2 and h3 of rendered HTML, which carry ids already. */
export function headings(html: string): Heading[] {
  const found: Heading[] = [];
  for (const m of html.matchAll(/<h([23]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)) {
    found.push({
      level: Number(m[1]) as 2 | 3,
      id: m[2]!,
      html: m[3]!,
      text: strip(m[3]!),
    });
  }
  return found;
}

const SKIP = new Set(["pre", "code", "a", "h1", "h2", "h3", "h4"]);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Turns "see X" into a link where X is exactly a heading of the same file (plain-text headings only),
 * outside code and links. Anything else is left alone.
 */
export function linkReferences(html: string, found: Heading[]): string {
  const plain = found
    .filter((h) => h.text === h.html)
    .sort((a, b) => b.text.length - a.text.length);
  if (!plain.length) return html;
  const byText = new Map(plain.map((h) => [h.text, h.id]));
  const re = new RegExp(`\\b(see )(${plain.map((h) => escape(h.text)).join("|")})(?![\\w-])`, "g");
  let skip = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      const tag = /^<(\/?)([a-z0-9]+)/i.exec(part);
      if (tag) {
        if (SKIP.has(tag[2]!.toLowerCase()) && !part.endsWith("/>")) skip += tag[1] ? -1 : 1;
        return part;
      }
      if (skip > 0) return part;
      return part.replace(
        re,
        (_, see: string, name: string) =>
          `${see}<a class="xref" href="#${byText.get(name)}">${name}</a>`,
      );
    })
    .join("");
}
