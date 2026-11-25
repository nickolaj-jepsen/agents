// A unit's `CHANGELOG.md`, in Keep a Changelog form with flat bullets:
//
//   # Changelog
//
//   ## [Unreleased]
//
//   - What a user will notice, written when the change lands.
//
//   ## [0.2.0] - 2026-11-25
//
//   - **Breaking:** what stops working, first.
//   - What changed.
//
// Newest first. A release turns `[Unreleased]` into the dated section and leaves an empty one above
// it. No imports beyond `version.ts`, so the publish script runs it with plain node.
import { SEMVER, compareSemver } from "./version.ts";

export const UNRELEASED = "Unreleased";

export type Section = {
  /** A version, or `Unreleased`. */
  name: string;
  /** `YYYY-MM-DD`; a version's section has one, `Unreleased` has none. */
  date?: string;
  /** What is under the heading, without the blank lines around it. */
  body: string;
};

export type Changelog = {
  /** What is above the first section: the title. */
  preamble: string;
  sections: Section[];
};

const HEADING = /^## \[([^\]]+)\](?: - (\S+))?[ \t]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseChangelog(text: string): Changelog {
  const preamble: string[] = [];
  const sections: (Section & { lines: string[] })[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = HEADING.exec(line);
    if (m) {
      sections.push({
        name: m[1] as string,
        ...(m[2] ? { date: m[2] } : {}),
        body: "",
        lines: [],
      });
      continue;
    }
    (sections.at(-1)?.lines ?? preamble).push(line);
  }
  return {
    preamble: preamble.join("\n").trim(),
    sections: sections.map(({ lines, ...section }) => ({
      ...section,
      body: lines.join("\n").trim(),
    })),
  };
}

export function renderChangelog(log: Changelog): string {
  const blocks = [log.preamble || "# Changelog"];
  for (const s of log.sections) {
    const heading = s.date ? `## [${s.name}] - ${s.date}` : `## [${s.name}]`;
    blocks.push(s.body ? `${heading}\n\n${s.body}` : heading);
  }
  return blocks.join("\n\n") + "\n";
}

/** The bullets of a section: the lines a release ships. */
export const notesOf = (section: Section | undefined): string[] =>
  (section?.body ?? "").split("\n").filter((line) => /^- \S/.test(line));

export const sectionOf = (text: string, name: string): Section | undefined =>
  parseChangelog(text).sections.find((s) => s.name === name);

/** A new unit's changelog: an empty `[Unreleased]` over its first version. */
export function firstChangelog(version: string, date: string, notes: string[]): string {
  return renderChangelog({
    preamble: "# Changelog",
    sections: [
      { name: UNRELEASED, body: "" },
      { name: version, date, body: notes.map((note) => `- ${note}`).join("\n") },
    ],
  });
}

/**
 * What is wrong with a changelog for a unit at `version`, as lines; empty when it is in order. The
 * rule the gate holds: the newest dated section is the unit's version and says something, so a bump
 * cannot land without its notes and notes cannot be dated without the bump.
 */
export function checkChangelog(text: string, version: string): string[] {
  const { sections } = parseChangelog(text);
  const problems: string[] = [];
  if (sections[0]?.name !== UNRELEASED)
    problems.push("the first section must be `## [Unreleased]`, even when it is empty");
  const dated = sections.filter((s) => s.name !== UNRELEASED);
  if (sections.filter((s) => s.name === UNRELEASED).length > 1)
    problems.push("there is more than one `## [Unreleased]` section");
  for (const s of dated) {
    if (!SEMVER.test(s.name)) problems.push(`\`## [${s.name}]\` is not a version`);
    else if (!s.date || !DATE.test(s.date))
      problems.push(`\`## [${s.name}]\` needs its date: \`## [${s.name}] - YYYY-MM-DD\``);
  }
  const versions = dated.map((s) => s.name).filter((name) => SEMVER.test(name));
  for (let i = 1; i < versions.length; i++)
    if (compareSemver(versions[i - 1] as string, versions[i] as string) <= 0)
      problems.push(`\`[${versions[i]}]\` is under \`[${versions[i - 1]}]\`: newest goes first`);
  const newest = dated[0];
  if (!newest) problems.push(`there is no section for ${version}`);
  else if (newest.name !== version)
    problems.push(
      `the newest section is \`[${newest.name}]\` and the version is ${version}: ` +
        `\`pnpm release\` writes both, or add \`## [${version}] - YYYY-MM-DD\` by hand`,
    );
  else if (notesOf(newest).length === 0)
    problems.push(`\`## [${version}]\` has no \`- \` line saying what changed`);
  return problems;
}

/**
 * The changelog after a release: `[Unreleased]`'s lines become `[version] - date`, under a new
 * empty `[Unreleased]`. Refuses when there is nothing to release, or the version is already there.
 */
export function cutRelease(text: string, version: string, date: string): string {
  const log = parseChangelog(text);
  if (log.sections.some((s) => s.name === version))
    throw new Error(`the changelog already has a \`## [${version}]\` section`);
  const unreleased = log.sections.find((s) => s.name === UNRELEASED);
  if (notesOf(unreleased).length === 0)
    throw new Error(
      "nothing under `## [Unreleased]`: write what a user will notice there first, one `- ` line each",
    );
  const rest = log.sections.filter((s) => s.name !== UNRELEASED);
  return renderChangelog({
    preamble: log.preamble,
    sections: [
      { name: UNRELEASED, body: "" },
      { name: version, date, body: (unreleased as Section).body },
      ...rest,
    ],
  });
}

/** The changelog a published plugin carries: the released versions, without `[Unreleased]`. */
export function publishedChangelog(text: string): string {
  const log = parseChangelog(text);
  return renderChangelog({
    preamble: log.preamble,
    sections: log.sections.filter((s) => s.name !== UNRELEASED),
  });
}
