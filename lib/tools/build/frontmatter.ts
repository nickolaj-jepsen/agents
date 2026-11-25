// The YAML frontmatter a SKILL.md or a bundle's README.md starts with, and the text after it.
import { parse } from "yaml";

export type Frontmatter = { data: Record<string, any>; body: string };

export function frontmatter(file: string, text: string): Frontmatter {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) throw new Error(`${file}: no frontmatter`);
  let data: unknown;
  try {
    data = parse(m[1] as string);
  } catch (e) {
    throw new Error(`${file}: frontmatter is not YAML: ${(e as Error).message}`);
  }
  return {
    data: data && typeof data === "object" ? (data as Record<string, any>) : {},
    body: text.slice(m[0].length).replace(/^\n+/, ""),
  };
}
