import { region, type Region } from "../lib/screen.ts";
import { scenarios, type Scenario, type Step } from "../lib/scenario.ts";
import type { Session } from "../lib/session.ts";
import { says } from "./fixture.ts";

const keys = (...names: string[]): Step[] => names.map((press) => ({ press }));
const ask: Step[] = [{ type: "ask" }, { press: "Enter" }];
const answer: Step[] = [{ type: "/answer" }, { press: "Enter" }];
const round: Step[] = [...ask, { wait: /(?:^|\s)Q?1\/\d/ }, ...answer];
const turn = (fixture: string): Scenario["start"] => ({
  hermetic: true,
  plugins: ["answer"],
  args: ["--model", "haiku"],
  turns: [...says(fixture), { text: "Reply received." }],
});

const expectPrompt = (want: string) => async (session: Session) => {
  const rows = (await session.text()).split("\n");
  const start = rows.map((row) => row.startsWith("❯")).lastIndexOf(true);
  const end = rows.findIndex((row, i) => i > start && /^─+$/.test(row.trimEnd()));
  const got = rows
    .slice(start, end < 0 ? undefined : end)
    .map((row) => row.slice(2).trimEnd())
    .join("\n")
    .trim();
  if (got !== want)
    throw new Error(`Expected prompt ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};

/**
 * The cards on screen down to the control bar, from row 1: once the cards fill the screen,
 * Claude Code pins the prompt over row 0 on some runs and not on others.
 */
const CARDS: Region = (grid) => {
  const found = region.rows(/[▎│╭]/, /^(?:Q?\d+(?:\/\d+)?|Review) .*\[-\]/)(grid.slice(1));
  return found && { ...found, y: found.y + 1 };
};

export default scenarios({
  plugin: "answer",
  harness: "claude",
  region: CARDS,
  scenarios: {
    open: {
      about: "/answer brings the first transcript card into view",
      start: turn("two-q"),
      size: [96, 34],
      steps: [...round, { wait: /❯\s+Q1\s+Use SQLite/ }],
    },
    picked: {
      from: "open",
      about: "a click picks in place and the focused bar changes questions with j and k",
      steps: [
        { click: "B ○ Postgres" },
        { wait: "B ● Postgres" },
        ...keys("Alt+a", "j"),
        { wait: /❯\s+Q2\s+Add caching/ },
        { press: "k" },
        { wait: /❯\s+Q1\s+Use SQLite/ },
      ],
    },
    "note-kept": {
      from: "picked",
      about: "Writing mode saves two lines and returns to the originating question",
      steps: [
        { press: "n" },
        { wait: /Note:.*⏎ save/ },
        { type: "Keep the hosted instance." },
        { press: "Shift+Enter" },
        { type: "Rotate its credentials first." },
        { press: "Enter" },
        // The note showed as it was typed: the editor's hint going proves the save.
        { wait: /Note:.*⏎ save/, gone: true },
        { wait: "Q1/2" },
        { wait: "Rotate its credentials first." },
      ],
    },
    review: {
      from: "note-kept",
      about: "r reaches the closing row: the pointer on it, Fill suggested, the band's keys for it",
      // The closing row to the bar: the cards above it sit wherever the transcript scrolled.
      region: region.rows(/▎ ❯ 1 of 2 answered/, /^Review .*\[-\]/),
      steps: [{ press: "r" }, { wait: /❯ 1 of 2 answered\s+Fill prompt/ }, { wait: "n note" }],
    },
    "summary-fill": {
      from: "review",
      about: "a click on Fill prompt puts the reply in the prompt",
      region: region.rows(/^❯\s*Q1: B$/, /^─+$/),
      steps: [{ hover: "Fill prompt" }, { click: "Fill prompt" }, { wait: /^❯\s*Q1: B$/m }],
    },
    "fill-click": {
      from: "note-kept",
      about:
        "j reaches the closing row; clicking its Enter hint fills and keeps the composer draft",
      region: region.rows(/^❯\s*Q1: B$/, /^─+$/),
      steps: [
        { click: /^❯\s*$/ },
        { type: "draft to keep" },
        ...keys("Alt+a", "j"),
        { wait: "Q2/2" },
        { press: "j" },
        { wait: "❯ 1 of 2 answered" },
        { press: "k" },
        { wait: "Q2/2" },
        { press: "j" },
        { wait: "❯ 1 of 2 answered" },
        { click: "jk move" },
        { wait: "❯ 1 of 2 answered" },
        { click: "enter fill" },
        { wait: /^❯\s*Q1: B$/m },
        {
          run: expectPrompt(
            "Q1: B\n    Note: Keep the hosted instance.\n          Rotate its credentials first.\n\ndraft to keep",
          ),
        },
      ],
    },
    reopened: {
      from: "note-kept",
      about: "an unrelated message sets aside the draft for /answer",
      region: region.rows(/▎.*❯\s+Q1/, /Rotate its credentials first/),
      steps: [
        { click: /^❯\s*$/ },
        { type: "We should discuss this first." },
        { press: "Enter" },
        { wait: "Reply received." },
        ...answer,
        { wait: "B ● Postgres" },
        { wait: "Rotate its credentials first." },
      ],
    },
    "write-in": {
      from: "open",
      about: "a write-in becomes the active question's answer",
      steps: [
        { click: "C ○ Write your own answer" },
        { wait: "Answer: Write your own answer" },
        { click: "Answer: Write your own answer" },
        { wait: /Answer:.*⏎ save/ },
        { type: "An embedded store" },
        { press: "Enter" },
        { wait: /C ●\s+An embedded store/ },
        { wait: "Q1/2" },
      ],
    },
    "mouse-note": {
      from: "open",
      about:
        "the mouse handoff keeps the first Enter from sending; multiline paste stays in the note",
      steps: [
        { type: "draft to keep" },
        { click: "Add a note" },
        { wait: "Note: Add a condition or follow-up" },
        { press: "Enter" },
        { wait: "Prompt dropped by a hook: The note is still waiting" },
        { run: expectPrompt("draft to keep") },
        { press: "Alt+a" },
        { wait: /Note:.*⏎ save/ },
        { paste: "First line\nSecond line" },
        { press: "Enter" },
        // The note showed as it was typed: the editor's hint going proves the save.
        { wait: /Note:.*⏎ save/, gone: true },
        { wait: "Second line" },
        { run: expectPrompt("draft to keep") },
      ],
    },
    "write-cancel": {
      from: "write-in",
      about: "cancel keeps the last saved answer and the prompt draft, then hands the keys back",
      steps: [
        { click: /^❯\s*$/ },
        { type: "draft to keep" },
        ...keys("Alt+a", "c"),
        { wait: /Answer:.*⏎ save/ },
        { type: "unsaved addition" },
        { click: "Cancel" },
        { wait: /C ●\s+An embedded store/ },
        { wait: "unsaved addition", gone: true },
        // Opened again, the field holds the saved answer, not what was cancelled.
        { press: "c" },
        { wait: /Answer:.*⏎ save/ },
        { wait: "unsaved addition", gone: true },
        { click: "Cancel" },
        { wait: /C ●\s+An embedded store/ },
        { run: expectPrompt("draft to keep") },
        { press: "j" },
        { wait: "Q2/2" },
      ],
    },
    cleared: {
      from: "note-kept",
      about: "clear removes a picked option in place and leaves its note",
      region: region.rows(/▎.*❯\s+Q1/, /Rotate its credentials first/),
      steps: [
        { click: "B ● Postgres" },
        { wait: "B ○ Postgres" },
        { wait: "Q1/2" },
        { wait: "Rotate its credentials first." },
        // `note-kept`'s snapshots leave the transcript at its end, where a narrow screen has no
        // room for Q1's top; the bar's position brings the question into view.
        { click: "Q1/2" },
        { wait: /❯\s+Q1/ },
      ],
    },
    "long-title": {
      about: "a title longer than the transcript's reading width",
      start: turn("long-title"),
      steps: round,
      extreme: true,
    },
    "long-body": {
      about: "a tall card remains scrollable with a thin control bar",
      start: turn("long-body"),
      steps: round,
      extreme: true,
    },
    "long-option": {
      about: "long option labels and their detail wrap within the card",
      start: turn("long-option"),
      steps: round,
      extreme: true,
    },
    "inline-markdown": {
      about: "an option's code, bold and link are set, and a click on its last line picks it",
      start: turn("inline-markdown"),
      steps: [...round, { click: "permanentRedirect()" }, { wait: /A ● A 200 response/ }],
    },
    "wide-chars": {
      about: "CJK and emoji in titles and options",
      start: turn("wide-chars"),
      steps: round,
    },
    "table-code": {
      about: "a Markdown table and code block in a question body",
      start: turn("table-code"),
      steps: round,
    },
    many: {
      about: "twelve questions and eight letter keys, including H",
      start: turn("many"),
      size: [96, 30],
      extreme: true,
      steps: [
        ...round,
        ...keys("Alt+a", "j"),
        { wait: "Q2/12" },
        { press: "j" },
        { wait: "Q3/12" },
        { resize: [70, 24] },
        { wait: /A–H pick.*I write.*n note.*r review.*keys here/ },
        { press: "h" },
        { wait: "H ● Option H for 3" },
        { press: "j" },
        { wait: "Q4/12" },
        { press: "x" },
        { press: "k" },
        { wait: /❯\s+Q3\s+Question number 3/ },
      ],
    },
    "many-review": {
      from: "many",
      about: "the closing row after twelve questions; k goes back to the last one",
      extreme: true,
      steps: [
        { press: "r" },
        { wait: /^Review\s+1\/12 answered.*jk move/m },
        { press: "k" },
        { wait: /❯\s+Q12\s+Question number 12/ },
        { press: "j" },
        { wait: "❯ 1 of 12 answered" },
        { resize: [70, 24] },
      ],
    },
    "count-click": {
      from: "many-review",
      about: "a click on the closing row's count goes to the first question, at the round's top",
      steps: [
        { hover: "1 of 12 answered" },
        { click: "1 of 12 answered" },
        { wait: /❯\s+Q1\s+Question number 1/ },
        { wait: "Q1/12" },
      ],
    },
    numbered: {
      about: "questions with write-in answers only",
      start: turn("numbered"),
      steps: round,
    },
    recommended: {
      about: "recommendations and their rationale remain visible in the cards",
      start: turn("recommended"),
      steps: round,
    },
    none: {
      about: "a turn ending without a round leaves nothing to answer",
      start: turn("none"),
      region: region.rows(/Done\. What changed/, /Tests pass/),
      steps: [...ask, { wait: "Tests pass" }, ...answer, { wait: "Nothing to answer" }],
    },
    picks: {
      about: "a numbered pick list still opens in the band",
      start: turn("picks"),
      region: region.rows(/\[-\]$/, /^─+$/),
      steps: [...ask, { wait: /Pick|Answer 2/ }, ...keys("Alt+a", "Enter"), { wait: /r: review/ }],
    },
  },
});
