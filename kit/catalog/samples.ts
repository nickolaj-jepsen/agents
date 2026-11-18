/**
 * The catalogue's sample data, one set for both harnesses, so a difference between two renders
 * is the harness's. Data only, no imports: the pi stories import it, and the Claude catalogue
 * mod, which cannot import outside its folder, carries a copy (`claude/claude/samples.ts`) that
 * `just kit-sync` writes and a test compares.
 */

export const SENTENCE =
  "The section says the build verifies a pi change, but the build only type-checks the cores and the pi halves and never starts an agent.";
export const LONG = `${SENTENCE} ${SENTENCE} ${SENTENCE}`;
export const CJK =
  "この節は古くなっています。ビルドが検証するのは型だけで、エージェントを起動しないことを書き足す必要があります。";

/** Sample rows for every list story. */
export type Row = {
  id: string;
  group: string;
  title: string;
  kind: "wrong" | "missing" | "stale";
  seen: number;
  age: string;
};
const row = (
  n: number,
  group: string,
  title: string,
  kind: Row["kind"],
  seen: number,
  age: string,
): Row => ({
  id: String(n),
  group,
  title,
  kind,
  seen,
  age,
});
export const GROUPED: Row[] = [
  row(
    1,
    "AGENTS.md",
    "`just build` is not enough to verify a pi change; the docs say it is.",
    "wrong",
    3,
    "2d",
  ),
  row(
    2,
    "docs/hosts.md",
    "The `legacy` card was removed; the section still describes it.",
    "stale",
    2,
    "1mo",
  ),
  row(
    3,
    "docs/hosts.md",
    "Darwin hosts need the app leaf to work on both halves.",
    "missing",
    1,
    "5d",
  ),
  row(
    4,
    "docs/modules.md",
    "A leaf that imports a third-party module imports it on every host; the page should say that module must be inert when the feature is off.",
    "missing",
    1,
    "9d",
  ),
  row(5, "docs/secrets.md", "Rekeying needs the YubiKey.", "wrong", 5, "today"),
  row(
    6,
    "docs/secrets.md",
    "The edit command takes the path to the .age file, not a bare name.",
    "stale",
    1,
    "12d",
  ),
];
export const SCROLLING: Row[] = Array.from({ length: 30 }, (_, i) =>
  row(
    100 + i,
    `docs/page-${Math.floor(i / 4) + 1}.md`,
    `Claim ${i + 1}: the page no longer matches what the code does.`,
    (["wrong", "missing", "stale"] as const)[i % 3]!,
    1 + (i % 4),
    `${1 + ((i * 7) % 28)}d`,
  ),
);
export const EXTREME: Row[] = [
  row(
    200,
    "docs/a-very-long-directory-name/with/several/nested/levels/and-an-equally-long-file-name-for-the-guide.md",
    LONG,
    "wrong",
    12,
    "1mo",
  ),
  row(201, "AGENTS.md", "Unbroken".repeat(30), "missing", 100, "today"),
  row(202, "AGENTS.md", "Short.", "stale", 1, "1d"),
];
export const WIDE: Row[] = [
  row(300, "docs/日本語のドキュメント.md", CJK, "missing", 3, "5d"),
  row(301, "docs/日本語のドキュメント.md", `混在 mixed ＡＢＣ text ${CJK}`, "wrong", 1, "2d"),
  row(
    302,
    "docs/emoji.md",
    "A pointer, a mark and a 🙂 in a title that is long enough to be cut somewhere.",
    "stale",
    2,
    "9d",
  ),
];

/** Small valid PNGs for the Claude image stories: a landscape and a portrait. */
export const LANDSCAPE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAYAAAA5DDySAAAAdklEQVR42u3ZsRGAIAwFUIZxAAtHsLO2ZyVXYyHcAAu5Q8wrfpm78JrkQtqOXFtZ1r2Z2esTAAAAAAAAEBjg7w98qgfQo4FyncMCAAAAAADeAPQYMyMBPrEJAgAAAAAAAJMC2AQBAHARAgAAQFwAP0MAAIQGuAEhKJcojry0RgAAAABJRU5ErkJggg==";
export const PORTRAIT_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABgAAABACAYAAAAAqrdiAAAAaElEQVR42u3Yuw2AMAwFwAzDABSMkI4laJmJIRgxbODwEUoiXfFK+xrbUpKWdStRpjmHqdUnAGAA4GuDWj0AMALQdJP387gdAOBHIJrxJ8CrTQYAOgGcCgDAqQAAmr8PAAD/RQBAL8AFPqSooo9jlH0AAAAASUVORK5CYII=";

/** Dated entries for the entries stories. */
export const LOG: { date: string; text: string }[] = [
  {
    date: "2026-11-13",
    text: "`just build` printed an error: derivation failed while evaluating the attribute.",
  },
  { date: "2026-10-16", text: "The section says the build verifies a pi change." },
  { date: "2026-09-02", text: "Short." },
];
export const LONG_ENTRY = { date: "2026-11-13", text: LONG };
/** The detail pane's evidence. */
export const EVIDENCE = [
  {
    date: "2026-11-13",
    text: "AGENTS.md: the line contradicts what the code does now, in two places.",
  },
  { date: "2026-11-02", text: "one line." },
];
