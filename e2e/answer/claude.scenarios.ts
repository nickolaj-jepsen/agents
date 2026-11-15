import { region, type Region } from "../lib/screen.ts";
import { scenarios, type Scenario, type Step } from "../lib/scenario.ts";
import type { Session } from "../lib/session.ts";
import { says } from "./fixture.ts";

/**
 * The band above the prompt: from its first row (the divider, or the collapsed row) down,
 * without the engine's hints between it and the prompt.
 */
const band: Region = (grid) => {
  const lines = grid.map((row) =>
    row
      .map((c) => c.char)
      .join("")
      .trimEnd(),
  );
  // The first row carries the fold button; short terminals scroll the divider out of view.
  const top = lines.findIndex((l) => /\[-\]$/.test(l));
  if (top < 0) return undefined;
  let bottom = lines.findIndex((l, i) => i > top && /^─+$/.test(l)) - 1;
  if (bottom < top) bottom = lines.length - 1;
  while (bottom > top && /^$|tmux|ctrl\+g to edit|\/effort|focus-events/.test(lines[bottom] ?? ""))
    bottom--;
  return { x: 0, y: top, w: grid[0]?.length ?? 0, h: bottom - top + 1 };
};

/** The prompt's rows: from its last `❯` to its bottom rule. */
const prompt: Region = (grid) => {
  const lines = grid.map((row) =>
    row
      .map((c) => c.char)
      .join("")
      .trimEnd(),
  );
  const top = lines.map((l) => l.startsWith("❯")).lastIndexOf(true);
  if (top < 0) return undefined;
  const rule = lines.findIndex((l, i) => i > top && /^─+$/.test(l));
  return { x: 0, y: top, w: grid[0]?.length ?? 0, h: (rule < 0 ? lines.length : rule) - top };
};

/** One step per key: a key sent before the last one settled can be lost. */
const keys = (...names: string[]): Step[] => names.map((press) => ({ press }));

/** The turn, then the band's one row. */
const ASKED: Step[] = [{ type: "ask" }, { press: "Enter" }, { wait: /Answer \d+ questions?/ }];
/** alt+a focuses the band and Enter presses its row: the form opens. */
const OPEN: Step[] = [...keys("Alt+a", "Enter"), { wait: /r: review/ }];
/** A picked answer's note field; a click focuses it, which the pick alone does not. */
const NOTE: Step[] = [{ click: "A note on this answer" }];

// The model is pinned, or the user's default (and the rows its status line takes) leaks into a snapshot.
const turn = (fixture: string): Scenario["start"] => ({
  args: ["--model", "haiku"],
  turns: says(fixture),
});

/** What the prompt holds: the rows after the last `❯`, down to its bottom rule, the glyph dropped. */
export function promptText(screen: string): string {
  const rows = screen.split("\n");
  const top = rows.map((r) => r.startsWith("❯")).lastIndexOf(true);
  const out: string[] = [];
  for (const row of rows.slice(top)) {
    if (/^─+$/.test(row.trimEnd())) break;
    out.push(row.slice(2).trimEnd());
  }
  return out.join("\n").trim();
}

const expectPrompt = (want: string) => async (s: Session) => {
  const got = promptText(await s.text());
  if (got !== want)
    throw new Error(`the prompt holds\n${JSON.stringify(got)}\nnot\n${JSON.stringify(want)}`);
};

const asserts = (pattern: RegExp | string): Step => ({ wait: pattern, timeout: 4000 });

export default scenarios({
  plugin: "answer",
  harness: "claude",
  region: band,
  mask: [
    // The model's name, the spinner's verb and the run's folder in a wrapped path.
    { pattern: /\b(?:Opus|Sonnet|Haiku) \d+(?:\.\d+)?\b/g, with: "<model>" },
    { pattern: /(?<=✻ )\S+(?= for )/g, with: "<verb>" },
    { pattern: /e2e-[A-Za-z0-9]{6}/g, with: "e2e-<run>" },
  ],
  scenarios: {
    // ---- the band, closed

    collapsed: {
      about: "a turn that asked two questions: the band's one row",
      start: turn("two-q"),
      steps: ASKED,
    },
    "collapsed-hover": {
      from: "collapsed",
      about: "the pointer on the closed band's row",
      steps: [{ hover: "Answer 2 questions" }],
    },
    none: {
      about: "a turn that asked nothing: no band, and /answer says so",
      start: turn("none"),
      // The message only: the header and the toast move about, the spinner's line varies in width.
      region: region.rows(/Done\. What changed/, /Tests pass/),
      steps: [
        { type: "ask" },
        { press: "Enter" },
        { wait: "Tests pass" },
        { type: "/answer" },
        { press: "Enter" },
        { wait: "Nothing to answer" },
      ],
    },

    // ---- the form

    open: {
      from: "collapsed",
      about: "alt+a, Enter: the form on its first question",
      steps: OPEN,
    },
    "open-by-click": {
      from: "collapsed",
      about: "a click on the closed band's row opens the form",
      steps: [{ click: "Answer 2 questions" }, { wait: /r: review/ }],
    },
    "open-by-command": {
      from: "collapsed",
      about: "/answer opens the form too",
      steps: [{ type: "/answer" }, { press: "Enter" }, { wait: /r: review/ }],
    },
    single: {
      about: "one question",
      start: turn("single"),
      steps: [{ type: "ask" }, { press: "Enter" }, { wait: /Answer 1 question/ }, ...OPEN],
    },
    "hover-option": {
      from: "open",
      about: "the pointer on an answer",
      steps: [{ hover: "2: B. Postgres" }],
    },
    "hover-key": {
      from: "open",
      about: "the pointer on a key of the keys row",
      steps: [{ hover: "s: skip" }],
    },
    "hover-tab": {
      from: "open",
      about: "the pointer on the other question's tab",
      steps: [{ hover: "○ Q2" }],
    },
    pick: {
      from: "open",
      about: "1 picks A and opens its note field",
      steps: [{ press: "1" }, { wait: "A note on this answer" }],
    },
    "pick-click": {
      from: "open",
      about: "a click picks B",
      steps: [{ click: "2: B. Postgres" }, { wait: "A note on this answer" }],
    },
    "pick-double": {
      from: "open",
      about: "a double click picks B and goes on to the next question",
      steps: [{ doubleClick: "2: B. Postgres" }, { wait: "Add caching?" }],
    },
    "next-by-key": {
      from: "pick",
      about: "Enter in the note goes on to the second question; its tab is still open",
      steps: [{ press: "Enter" }, asserts("1: A. Yes")],
    },
    "next-by-click": {
      from: "pick",
      about: "a click on `l: next`",
      steps: [{ click: "l: next" }, asserts("1: A. Yes")],
    },
    "tab-click": {
      from: "next-by-key",
      about: "a click on the first question's tab: back on it, A kept",
      steps: [{ click: "✓ Q1" }, asserts("1: A. SQLite")],
    },
    "back-by-key": {
      from: "next-by-key",
      about: "h goes back",
      steps: [{ press: "h" }, asserts("1: A. SQLite ✓")],
    },
    "back-by-click": {
      from: "next-by-key",
      about: "a click on `h: back`",
      steps: [{ click: "h: back" }, asserts("1: A. SQLite ✓")],
    },
    skip: {
      from: "open",
      about: "s skips the question",
      steps: [{ press: "s" }, asserts("1: A. Yes")],
    },
    "skip-click": {
      from: "open",
      about: "a click on `s: skip`",
      steps: [{ click: "s: skip" }, asserts("1: A. Yes")],
    },
    quit: {
      from: "back-by-key",
      about: "q folds the form; the answer stays counted",
      steps: [{ press: "q" }, { wait: /1 of 2/ }],
    },
    "quit-click": {
      from: "pick",
      about: "a click on `q: quit`",
      steps: [{ click: "q: quit" }, { wait: /1 of 2/ }],
    },
    "fold-click": {
      from: "open",
      about: "a click on the divider's [-] hides the whole plugin panel, the form with it",
      region: region.rows(/plugin panel hidden/),
      steps: [{ click: "[-]" }, { wait: /plugin panel hidden/ }],
    },
    "unfold-click": {
      from: "fold-click",
      about: "a click on the hidden panel's row brings the form back",
      region: band,
      steps: [{ click: "plugin panel hidden" }, { wait: /r: review/ }],
    },
    "reopen-after-quit": {
      from: "quit",
      about: "reopened with the answer kept",
      steps: [...keys("Alt+a", "Enter"), asserts("A. SQLite ✓")],
    },
    "keys-walk": {
      from: "open",
      about: "every key of the keys row, each checked on the screen, ending on the review",
      steps: [
        { press: "1" },
        asserts("A. SQLite ✓"),
        { press: "Enter" },
        asserts("Add caching?"),
        { press: "h" },
        asserts("A. SQLite ✓"),
        { press: "s" },
        asserts("Add caching?"),
        { press: "h" },
        { press: "n" },
        asserts("A note on this answer"),
        { click: "r: review" },
        { wait: "fill the prompt" },
      ],
    },
    "multi-key": {
      from: "open",
      about: "m turns the question into several answers",
      steps: [{ press: "m" }, asserts("[ ] ")],
    },
    "multi-click": {
      from: "open",
      about: "a click on `m: multi`",
      steps: [{ click: "m: multi" }, asserts("[ ] ")],
    },
    "multi-picked": {
      from: "multi-key",
      about: "two of the options ticked in a multi question",
      steps: [...keys("1", "2"), asserts("[x] ")],
    },
    several: {
      about: "a question whose recommendation names several options",
      start: turn("several"),
      steps: [
        { type: "ask" },
        { press: "Enter" },
        { wait: /Answer 1 question/ },
        ...OPEN,
        { press: "y" },
      ],
    },
    recommended: {
      about: "three questions with recommendations: the markers and the yes key",
      start: turn("recommended"),
      steps: [{ type: "ask" }, { press: "Enter" }, { wait: /Answer 3 questions/ }, ...OPEN],
    },
    "recommended-yes": {
      from: "recommended",
      about: "y takes the recommendation",
      steps: [{ press: "y" }, asserts("(recommended) ✓")],
    },
    "recommended-yes-click": {
      from: "recommended",
      about: "a click on `y: yes`",
      steps: [{ click: "y: yes" }, asserts("(recommended) ✓")],
    },
    "write-in": {
      from: "open",
      about: "3 opens the write-in field",
      steps: [{ press: "3" }, { wait: /Write your own answer/ }],
    },
    "write-typed": {
      from: "write-in",
      about: "an answer typed into the write-in",
      steps: [{ click: "Write your own answer" }, { type: "DuckDB, it is embedded" }],
    },
    "write-kept": {
      from: "write-typed",
      about: "Enter keeps the write-in as the answer",
      steps: [{ press: "Enter" }, asserts("Add caching?")],
    },
    "write-click": {
      from: "open",
      about: "a click on the write-in row opens its field",
      steps: [{ click: "3: ✎ Write your own answer" }, { wait: /Write your own answer/ }],
    },

    // ---- notes

    "note-typed": {
      from: "pick",
      about: "a note being typed on one line",
      steps: [...NOTE, { type: "keep the flag" }, asserts("keep the flag")],
    },
    "note-long": {
      from: "pick",
      about: "a note longer than the width, which wraps",
      steps: [
        ...NOTE,
        {
          type: "because the team already runs it and the dump tooling is there, and we would rather not retrain anyone on a new engine this quarter",
        },
        asserts("this quarter"),
      ],
      extreme: true,
    },
    "note-kept": {
      from: "note-typed",
      about: "Enter keeps the note and goes on; its tab shows it kept",
      steps: [
        { press: "Enter" },
        asserts("Add caching?"),
        { click: "✓ Q1" },
        asserts("keep the flag"),
      ],
    },
    "note-edit": {
      from: "note-kept",
      about: "a click on the kept note reopens it",
      steps: [{ click: "╰▸ keep the flag" }, asserts("⏎ next")],
    },
    "note-key": {
      from: "open",
      about: "n before an answer opens a note under the entries",
      steps: [{ press: "n" }, { wait: /Enter to go on/ }],
    },
    "note-click": {
      from: "open",
      about: "a click on `n: note` before an answer opens a note under the entries",
      steps: [{ click: "n: note" }, { wait: /Enter to go on/ }],
    },
    "note-newline-shift": {
      from: "pick",
      region: prompt,
      about: "shift+enter in a note starts a line of the note",
      steps: newlineNote([{ run: (s) => s.term.write("\x1b[13;2u") }]),
    },
    "note-newline-alt": {
      from: "pick",
      region: prompt,
      about: "alt+enter in a note starts a line",
      steps: newlineNote([{ press: "Alt+Enter" }]),
    },
    "note-newline-ctrl-j": {
      from: "pick",
      region: prompt,
      about: "ctrl+j in a note starts a line",
      steps: newlineNote([{ run: (s) => s.term.write("\n") }]),
    },
    "note-newline-paste": {
      from: "pick",
      region: prompt,
      about: "a pasted two-line note",
      steps: newlineNote(undefined, { paste: "a\nb" }),
    },
    "note-focus": {
      from: "open",
      about: "after a pick, typing reaches the note field with no second alt+a",
      steps: [
        { press: "1" },
        { wait: "A note on this answer" },
        { type: "typed at once" },
        { wait: "╰▸ typed at once", timeout: 3000 },
      ],
    },

    // ---- the review

    review: {
      from: "open",
      about: "both questions answered, on the review",
      // The note of a pick holds the keys, so the review is reached by its row of the divider.
      steps: [...keys("1", "Enter", "2"), { click: "r: review" }, { wait: "fill the prompt" }],
    },
    "review-click": {
      from: "open",
      about: "a click on the divider's `r: review`",
      steps: [...keys("1", "Enter", "2"), { click: "r: review" }, { wait: "fill the prompt" }],
    },
    "review-hover": {
      from: "review",
      about: "the pointer on the review's first row",
      steps: [{ hover: "Q1  A: SQLite" }],
    },
    "review-row": {
      from: "review",
      about: "a click on a review row goes back to that question",
      steps: [{ click: "Q2  B: No" }, asserts("2: B. No ✓")],
    },
    "review-row-key": {
      from: "review",
      about: "1 on the review goes back to the first question",
      steps: [{ press: "1" }, asserts("1: A. SQLite ✓")],
    },
    "review-note": {
      from: "review",
      about: "n on the review opens a note on the whole round",
      steps: [{ press: "n" }, { wait: /whole round/ }],
    },
    "review-note-typed": {
      from: "review-note",
      about: "the round's note typed, then kept",
      steps: [
        { click: "A note on the whole round" },
        { type: "thanks" },
        { press: "Enter" },
        asserts("thanks"),
      ],
    },
    "fill-click": {
      from: "review",
      about: "a click on the button writes the reply into the prompt",
      region: prompt,
      steps: [{ click: "fill the prompt" }, { wait: "Q2: B" }],
    },
    "fill-key": {
      from: "review",
      about: "Enter on the button writes the reply into the prompt",
      region: prompt,
      steps: [{ press: "Enter" }, { wait: "Q2: B" }],
    },
    "review-empty": {
      from: "open",
      about: "the review with nothing answered: filling says so",
      steps: [{ press: "r" }, { click: "fill the prompt" }, { wait: /Nothing answered yet/ }],
    },

    // ---- what the message holds

    many: {
      about: "twelve questions: the tabs run out of room",
      start: turn("many"),
      steps: [{ type: "ask" }, { press: "Enter" }, { wait: /Answer 12 questions/ }, ...OPEN],
      extreme: true,
    },
    "many-late": {
      from: "many",
      about: "the ninth question, its tab in view",
      steps: [
        ...keys(
          "1",
          "Enter",
          "1",
          "Enter",
          "1",
          "Enter",
          "1",
          "Enter",
          "1",
          "Enter",
          "1",
          "Enter",
          "1",
          "Enter",
          "1",
          "Enter",
        ),
      ],
    },
    "many-review": {
      from: "many-late",
      about: "the review of twelve, nine answered",
      steps: [{ press: "r" }, { wait: "fill the prompt" }],
    },
    "long-title": {
      about: "a question title far longer than the width",
      start: turn("long-title"),
      steps: [{ type: "ask" }, { press: "Enter" }, { wait: /Answer 1 question/ }, ...OPEN],
      extreme: true,
    },
    "long-option": {
      about: "options with very long text and detail",
      start: turn("long-option"),
      steps: [{ type: "ask" }, { press: "Enter" }, { wait: /Answer 1 question/ }, ...OPEN],
      extreme: true,
    },
    "long-body": {
      about: "a question with thirty lines of body",
      start: turn("long-body"),
      steps: [{ type: "ask" }, { press: "Enter" }, { wait: /Answer 1 question/ }, ...OPEN],
      extreme: true,
    },
    "wide-chars": {
      about: "CJK, emoji and a ZWJ sequence in a title and options",
      start: turn("wide-chars"),
      steps: [{ type: "ask" }, { press: "Enter" }, { wait: /Answer 1 question/ }, ...OPEN],
    },
    "table-code": {
      about: "a table and a code block in the question's body",
      start: turn("table-code"),
      steps: [{ type: "ask" }, { press: "Enter" }, { wait: /Answer 1 question/ }, ...OPEN],
    },
    picks: {
      about: "a pick list: build it, or route it",
      start: turn("picks"),
      steps: [{ type: "ask" }, { press: "Enter" }, { wait: /Pick|Answer 2/ }, ...OPEN],
    },
    numbered: {
      about: "numbered questions with no options",
      start: turn("numbered"),
      steps: [{ type: "ask" }, { press: "Enter" }, { wait: /Answer 2 questions/ }, ...OPEN],
    },
  },
});

/** The note's two lines in the form and the review: a joined gutter, `│  ` then `╰▸ `. */
const expectGutter = (screen: string) => {
  const rows = screen.split("\n").map((r) => r.trimEnd());
  const at = rows.findIndex((r) => /^\s*│  a$/.test(r));
  if (at < 0 || !/^\s*╰▸ b$/.test(rows[at + 1] ?? ""))
    throw new Error(`the note is not drawn as a gutter block:\n${rows.slice(-18).join("\n")}`);
};

/**
 * Types `a`, a line break, `b` into a picked answer's note (or pastes it whole), then checks the
 * field, the kept note, the review and the reply the prompt is filled with.
 */
function newlineNote(newline?: Step[], paste?: Step): Step[] {
  return [
    ...NOTE,
    ...(paste ? [paste] : [{ type: "a" } as Step, ...(newline ?? []), { type: "b" } as Step]),
    // Typing: the engine's field puts the second line under the first.
    { run: async (s) => expectFieldAligned(await s.text()) },
    { press: "Enter" },
    asserts("Add caching?"),
    { press: "2" },
    { click: "r: review" },
    { wait: "fill the prompt" },
    { run: async (s) => expectGutter(await s.text()) },
    { click: "Q1  A: SQLite" },
    asserts("1: A. SQLite ✓"),
    { run: async (s) => expectGutter(await s.text()) },
    { click: "r: review" },
    { wait: "fill the prompt" },
    { click: "fill the prompt" },
    { run: expectPrompt("Q1: A\n    Note: a\n          b\nQ2: B") },
  ];
}

/** While typing, the continuation line sits under the text after the lead. */
function expectFieldAligned(screen: string) {
  const rows = screen.split("\n");
  const at = rows.findIndex((r) => /(↳|╰▸) a/.test(r));
  const first = rows[at] ?? "";
  const col = first.indexOf("a", first.search(/↳|╰▸/));
  if (at < 0 || !(rows[at + 1] ?? "").startsWith(`${" ".repeat(col)}b`))
    throw new Error(
      `the second line is not under the first:\n${rows.slice(at, at + 3).join("\n")}`,
    );
}
