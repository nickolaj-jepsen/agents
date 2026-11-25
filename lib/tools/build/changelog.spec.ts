import { describe, expect, it } from "vitest";
import {
  checkChangelog,
  cutRelease,
  firstChangelog,
  notesOf,
  parseChangelog,
  publishedChangelog,
  renderChangelog,
  sectionOf,
} from "./changelog.ts";

const LOG = `# Changelog

## [Unreleased]

- Opens with Ctrl+O.

## [0.2.0] - 2026-11-25

- **Breaking:** the \`/answer\` command is now \`/ask\`.
- Wraps a long option instead of cutting it.

## [0.1.0] - 2026-11-01

- First versioned release.
`;

describe("changelog", () => {
  it("reads the sections, newest first, and writes them back as they were", () => {
    const log = parseChangelog(LOG);
    expect(log.preamble).toBe("# Changelog");
    expect(log.sections.map((s) => [s.name, s.date])).toEqual([
      ["Unreleased", undefined],
      ["0.2.0", "2026-11-25"],
      ["0.1.0", "2026-11-01"],
    ]);
    expect(notesOf(sectionOf(LOG, "0.2.0"))).toHaveLength(2);
    expect(renderChangelog(log)).toBe(LOG);
  });

  it("starts a unit's changelog with an empty Unreleased over its first version", () => {
    const text = firstChangelog("0.1.0", "2026-11-25", ["First versioned release."]);
    expect(text).toBe(
      "# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-11-25\n\n- First versioned release.\n",
    );
    expect(checkChangelog(text, "0.1.0")).toEqual([]);
  });

  it("is in order when its newest dated section is the unit's version and says something", () => {
    expect(checkChangelog(LOG, "0.2.0")).toEqual([]);
  });

  it("fails a bump that has no section, and a section the version did not follow", () => {
    expect(checkChangelog(LOG, "0.3.0").join("\n")).toContain(
      "the newest section is `[0.2.0]` and the version is 0.3.0",
    );
    expect(checkChangelog(LOG, "0.1.0").join("\n")).toContain("the newest section is `[0.2.0]`");
  });

  it("fails a section with no line, a missing Unreleased, a missing date and a wrong order", () => {
    const empty = "# Changelog\n\n## [Unreleased]\n\n## [0.2.0] - 2026-11-25\n\nSoon.\n";
    expect(checkChangelog(empty, "0.2.0").join("\n")).toContain("has no `- ` line");
    const headless = "# Changelog\n\n## [0.2.0] - 2026-11-25\n\n- A line.\n";
    expect(checkChangelog(headless, "0.2.0").join("\n")).toContain(
      "first section must be `## [Unreleased]`",
    );
    const undated = "# Changelog\n\n## [Unreleased]\n\n## [0.2.0]\n\n- A line.\n";
    expect(checkChangelog(undated, "0.2.0").join("\n")).toContain("needs its date");
    const backwards =
      "# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-11-01\n\n- One.\n\n## [0.2.0] - 2026-11-25\n\n- Two.\n";
    expect(checkChangelog(backwards, "0.1.0").join("\n")).toContain("newest goes first");
    expect(checkChangelog("# Changelog\n\n## [Unreleased]\n", "0.1.0").join("\n")).toContain(
      "there is no section for 0.1.0",
    );
  });

  it("turns Unreleased into the dated version and leaves an empty one above it", () => {
    const cut = cutRelease(LOG, "0.3.0", "2026-12-01");
    expect(cut).toBe(`# Changelog

## [Unreleased]

## [0.3.0] - 2026-12-01

- Opens with Ctrl+O.

## [0.2.0] - 2026-11-25

- **Breaking:** the \`/answer\` command is now \`/ask\`.
- Wraps a long option instead of cutting it.

## [0.1.0] - 2026-11-01

- First versioned release.
`);
    expect(checkChangelog(cut, "0.3.0")).toEqual([]);
  });

  it("refuses to release nothing, or a version that is already there", () => {
    const quiet = cutRelease(LOG, "0.3.0", "2026-12-01");
    expect(() => cutRelease(quiet, "0.4.0", "2026-12-02")).toThrow(/nothing under/);
    expect(() => cutRelease(LOG, "0.2.0", "2026-12-02")).toThrow(/already has/);
  });

  it("publishes the released versions without Unreleased", () => {
    const published = publishedChangelog(LOG);
    expect(published).not.toContain("Unreleased");
    expect(published).not.toContain("Ctrl+O");
    expect(published.startsWith("# Changelog\n\n## [0.2.0] - 2026-11-25\n")).toBe(true);
  });
});
