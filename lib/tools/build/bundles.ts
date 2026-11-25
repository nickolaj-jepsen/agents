/**
 * Bundles: named sets of skills, installed together. A bundle is `bundles/<name>/README.md` on main,
 * whose frontmatter names its skills one of two ways:
 *
 *   title: Spec to ship
 *   tagline: One line for the lists.
 *   skills: [to-spec, to-tickets, implement]    # by name, whatever their version, or
 *   category: clean-up                           # every released skill of a category but 0.0.x
 *   credit: "Optional, as a skill's credit."
 *
 * and whose body is the bundle's page. A skill names the skills it reads or loads in
 * `metadata.uses`, and a bundle installs those too, so no member is left without what it needs.
 *
 * A bundle has no version of its own: its version is made from its skills' versions (`versionOf`),
 * so it is published when one of them is released or its set changes, and never bumped by hand.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { frontmatter } from "./frontmatter.ts";
import { tierOf, versionOf } from "./version.ts";

/** What a bundle needs to know of a skill. */
export type SkillFacts = {
  name: string;
  version: string;
  category: string;
  /** The skills it reads or loads, from `metadata.uses`. */
  uses: string[];
  /** The skills its body links to (`](../<name>/`) or loads (`the `<name>` skill`). */
  named: string[];
};

export type Bundle = {
  name: string;
  title: string;
  tagline: string;
  credit?: string;
  /** The category it is made from, when it is made from one. */
  category?: string;
  /** The skills it names, or its category's released ones, in name order. */
  listed: string[];
  /** The skills those use that it does not name: installed too. */
  also: string[];
  /** Its version, made from every skill it installs. */
  version: string;
  body: string;
  /** `bundles/<name>`. */
  path: string;
};

const dirs = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];

const LINK = /\]\(\.\.\/([a-z0-9-]+)\//g;
const LOAD = /the `([a-z0-9-]+)` skill/g;

/** Every released skill's facts: what is under `skills/`. */
export function readSkillFacts(root: string): SkillFacts[] {
  const names = dirs(join(root, "skills")).filter((name) =>
    existsSync(join(root, "skills", name, "SKILL.md")),
  );
  const known = new Set(names);
  return names.map((name) => {
    const file = `skills/${name}/SKILL.md`;
    const { data, body } = frontmatter(file, readFileSync(join(root, file), "utf8"));
    const meta = (data.metadata ?? {}) as Record<string, unknown>;
    const uses = meta.uses ?? [];
    if (!Array.isArray(uses) || uses.some((u) => typeof u !== "string"))
      throw new Error(`${file}: metadata.uses must be a list of skill names`);
    const named = new Set<string>();
    for (const re of [LINK, LOAD])
      for (const m of body.matchAll(re)) {
        const other = m[1] as string;
        if (other !== name && known.has(other)) named.add(other);
      }
    return {
      name,
      version: String(meta.version ?? ""),
      category: String(meta.category ?? ""),
      uses: uses as string[],
      named: [...named].sort(),
    };
  });
}

/** What is wrong with the skills' `uses`, as lines: a name that is no skill, or one left out. */
export function checkUses(skills: SkillFacts[]): string[] {
  const known = new Set(skills.map((s) => s.name));
  return skills.flatMap((s) => [
    ...s.uses
      .filter((u) => !known.has(u))
      .map((u) => `skills/${s.name}/SKILL.md: metadata.uses names \`${u}\`, which is no skill`),
    ...s.named
      .filter((n) => !s.uses.includes(n))
      .map(
        (n) =>
          `skills/${s.name}/SKILL.md: reads or loads \`${n}\`; add it to metadata.uses, so a bundle installs it too`,
      ),
  ]);
}

/** A skill's uses, and theirs in turn, without the skill itself. */
function usedBy(skill: string, byName: Map<string, SkillFacts>): string[] {
  const seen = new Set<string>([skill]);
  const queue = [skill];
  while (queue.length > 0)
    for (const u of byName.get(queue.shift() as string)?.uses ?? [])
      if (!seen.has(u)) {
        seen.add(u);
        queue.push(u);
      }
  seen.delete(skill);
  return [...seen];
}

/**
 * Every bundle under `bundles/`, resolved against the released skills. `problems` lists what the
 * gate refuses; a bundle with a problem is left out of `bundles`.
 */
export function readBundles(
  root: string,
  skills: SkillFacts[] = readSkillFacts(root),
): { bundles: Bundle[]; problems: string[] } {
  const byName = new Map(skills.map((s) => [s.name, s]));
  const categories = new Set(skills.map((s) => s.category));
  const problems: string[] = [];
  const bundles: Bundle[] = [];
  for (const name of dirs(join(root, "bundles"))) {
    const file = `bundles/${name}/README.md`;
    if (!existsSync(join(root, file))) {
      problems.push(`bundles/${name}: has no README.md`);
      continue;
    }
    const { data, body } = frontmatter(file, readFileSync(join(root, file), "utf8"));
    const wrong = (why: string) => problems.push(`${file}: ${why}`);
    if (typeof data.title !== "string" || data.title === "") {
      wrong("frontmatter `title` must be a non-empty string");
      continue;
    }
    if (typeof data.tagline !== "string" || data.tagline === "") {
      wrong("frontmatter `tagline` must be a non-empty string");
      continue;
    }
    if (byName.has(name)) {
      wrong(`\`${name}\` is a skill's name too; a bundle needs a name of its own`);
      continue;
    }
    let listed: string[];
    if (Array.isArray(data.skills) === (data.category !== undefined)) {
      wrong("name its skills with `skills: [...]` or `category: <slug>`, one of the two");
      continue;
    } else if (Array.isArray(data.skills)) {
      const unknown = data.skills.filter((s: unknown) => typeof s !== "string" || !byName.has(s));
      if (unknown.length > 0) {
        wrong(`\`skills\` names what is no released skill: ${unknown.join(", ")}`);
        continue;
      }
      listed = [...new Set(data.skills as string[])].sort();
    } else {
      if (typeof data.category !== "string" || !categories.has(data.category)) {
        wrong(`\`category: ${data.category}\` is no skill's category`);
        continue;
      }
      // A category bundle recommends its skills: an unfinished one says it is not ready for that.
      listed = skills
        .filter((s) => s.category === data.category && tierOf(s.version) !== "unfinished")
        .map((s) => s.name);
    }
    if (listed.length === 0) {
      wrong("has no skills");
      continue;
    }
    const also = [...new Set(listed.flatMap((s) => usedBy(s, byName)))]
      .filter((s) => !listed.includes(s))
      .sort();
    bundles.push({
      name,
      title: data.title,
      tagline: data.tagline,
      ...(typeof data.credit === "string" ? { credit: data.credit } : {}),
      ...(typeof data.category === "string" ? { category: data.category } : {}),
      listed,
      also,
      version: versionOf(
        [...listed, ...also].map((s) => ({ name: s, version: byName.get(s)!.version })),
      ),
      body: body.trimEnd(),
      path: `bundles/${name}`,
    });
  }
  // The hand-picked first: a category's bundle repeats what the site lists under the category.
  bundles.sort(
    (a, b) =>
      Number(a.category !== undefined) - Number(b.category !== undefined) ||
      a.name.localeCompare(b.name),
  );
  return { bundles, problems };
}

/** Every skill a bundle installs, in name order. */
export const membersOf = (bundle: Pick<Bundle, "listed" | "also">): string[] =>
  [...bundle.listed, ...bundle.also].sort();
