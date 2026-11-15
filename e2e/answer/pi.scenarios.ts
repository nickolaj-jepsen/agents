import { region, type Region } from "../lib/screen.ts";
import { scenarios, type Scenario, type Step } from "../lib/scenario.ts";
import { says } from "./fixture.ts";

/** The open form's box, or the one line the widget draws while it is closed. */
const surface: Region = region.any(
  region.box(/1-9|esc /),
  region.rows(/Answer \d+ questions?|Pick \d/, /Answer \d+ questions?|Pick \d/),
);

/** One step per key: a key sent before the last one settled can be lost. */
const keys = (...names: string[]): Step[] => names.map((press) => ({ press }));

const ASKED: Step[] = [{ type: "ask" }, { press: "Enter" }, { wait: /Answer \d+ questions?/ }];
/** alt+a opens the form in the editor's place. */
const OPEN: Step[] = [{ press: "Alt+a" }, { wait: /1-9/ }];
const turn = (fixture: string): Scenario["start"] => ({ turns: says(fixture) });
const asserts = (pattern: RegExp | string): Step => ({ wait: pattern, timeout: 4000 });
const SOME = (fixture: string, n: number): Step[] => [
  { type: "ask" },
  { press: "Enter" },
  { wait: new RegExp(`Answer ${n} questions?`) },
  ...OPEN,
];

export default scenarios({
  plugin: "answer",
  harness: "pi",
  region: surface,
  scenarios: {
    // ---- the widget, closed

    collapsed: {
      about: "a turn that asked two questions: the widget's one line",
      start: turn("two-q"),
      steps: ASKED,
    },
    none: {
      about: "a turn that asked nothing: no widget, and /answer says so",
      start: turn("none"),
      region: region.full,
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
      about: "alt+a: the form on its first question",
      steps: OPEN,
    },
    "open-by-command": {
      from: "collapsed",
      about: "/answer opens the form too",
      steps: [{ type: "/answer" }, { press: "Enter" }, { wait: /1-9/ }],
    },
    single: {
      about: "one question",
      start: turn("single"),
      steps: SOME("single", 1),
    },
    "hover-option": {
      from: "open",
      about: "the pointer on an answer moves the cursor to it",
      steps: [{ hover: "2 B. Postgres" }, asserts("›2")],
    },
    "hover-chip": {
      from: "open",
      about: "the pointer on a key chip (no visible change)",
      steps: [{ hover: "s skip" }],
    },
    pick: {
      from: "open",
      about: "1 picks A and opens its note field",
      steps: [{ press: "1" }, { wait: "note ›" }],
    },
    "pick-click": {
      from: "open",
      about: "a click picks B",
      steps: [{ click: "2 B. Postgres" }, { wait: "note ›" }],
    },
    "pick-double": {
      from: "open",
      about: "a double click picks B and goes on to the next question",
      steps: [{ doubleClick: "2 B. Postgres" }, asserts("Add caching?")],
    },
    "next-by-key": {
      from: "pick",
      about: "Enter in the empty note goes on",
      steps: [{ press: "Enter" }, asserts("Add caching?")],
    },
    "forward-key": {
      from: "open",
      about: "f goes forward",
      steps: [{ press: "f" }, asserts("Add caching?")],
    },
    "forward-click": {
      from: "open",
      about: "a click on the `f forward` chip",
      steps: [{ click: "f forward" }, asserts("Add caching?")],
    },
    "forward-tab": {
      from: "open",
      about: "tab goes forward",
      steps: [{ press: "Tab" }, asserts("Add caching?")],
    },
    "back-key": {
      from: "forward-key",
      about: "b goes back",
      steps: [{ press: "b" }, asserts("1 of 2")],
    },
    "back-click": {
      from: "forward-key",
      about: "a click on the `b back` chip",
      steps: [{ click: "b back" }, asserts("1 of 2")],
    },
    "back-shift-tab": {
      from: "forward-key",
      about: "shift+tab goes back",
      steps: [{ press: "Shift+Tab" }, asserts("1 of 2")],
    },
    skip: {
      from: "open",
      about: "s skips the question",
      steps: [{ press: "s" }, asserts("Add caching?")],
    },
    "skip-click": {
      from: "open",
      about: "a click on the `s skip` chip",
      steps: [{ click: "s skip" }, asserts("Add caching?")],
    },
    close: {
      from: "pick",
      about: "esc leaves the field, esc again closes the form; the answer stays counted",
      steps: [{ press: "Escape" }, { press: "Escape" }, { wait: /1 answered/ }],
    },
    reopen: {
      from: "close",
      about: "reopened with the answer kept",
      steps: [{ press: "Alt+a" }, asserts("A. SQLite ✓")],
    },
    "keys-walk": {
      from: "open",
      about: "every key of the keys row, each checked on the screen, ending on the review",
      steps: [
        { press: "1" },
        asserts("A. SQLite ✓"),
        { press: "Enter" },
        asserts("Add caching?"),
        { press: "b" },
        asserts("A. SQLite ✓"),
        { press: "s" },
        asserts("Add caching?"),
        { press: "h" },
        { press: "n" },
        asserts("note ›"),
        { press: "Escape" },
        { press: "r" },
        { wait: "enter fill the prompt" },
      ],
    },
    "arrows-walk": {
      from: "open",
      about: "down and up move the cursor, right and left go forward and back, j and k as well",
      steps: [
        { press: "Down" },
        asserts("›2"),
        { press: "j" },
        asserts("›3"),
        { press: "Up" },
        { press: "k" },
        asserts("›1"),
        { press: "Right" },
        asserts("Add caching?"),
        { press: "Left" },
        asserts("1 of 2"),
        { press: "l" },
        asserts("Add caching?"),
      ],
    },
    "multi-key": {
      from: "open",
      about: "m turns the question into several answers",
      steps: [{ press: "m" }, asserts("[ ]")],
    },
    "multi-click": {
      from: "open",
      about: "a click on `m several`",
      steps: [{ click: "m several" }, asserts("[ ]")],
    },
    "multi-picked": {
      from: "multi-key",
      about: "two of the options ticked",
      steps: [...keys("1", "2"), asserts("[x]")],
    },
    several: {
      about: "a question whose recommendation names several options",
      start: turn("several"),
      steps: SOME("several", 1),
    },
    recommended: {
      about: "three questions with recommendations",
      start: turn("recommended"),
      steps: SOME("recommended", 3),
    },
    "write-in": {
      from: "open",
      about: "3 opens the write-in field",
      steps: [{ press: "3" }, { wait: /enter|esc/ }],
    },
    "write-typed": {
      from: "write-in",
      about: "an answer typed into the write-in",
      steps: [{ type: "DuckDB, it is embedded" }],
    },
    "write-kept": {
      from: "write-typed",
      about: "Enter keeps it and goes on",
      steps: [{ press: "Enter" }, asserts("Add caching?")],
    },
    "write-click": {
      from: "open",
      about: "a click on the write-in row opens its field",
      steps: [{ click: "3 Write your own answer" }, { wait: /esc/ }],
    },

    // ---- notes

    "note-typed": {
      from: "pick",
      about: "a note typed on one line",
      steps: [{ type: "keep the flag" }, asserts("keep the flag")],
    },
    "note-long": {
      from: "pick",
      about: "a note longer than the width",
      steps: [
        {
          type: "because the team already runs it and the dump tooling is there, and we would rather not retrain anyone on a new engine this quarter",
        },
        asserts("this quarter"),
      ],
      extreme: true,
    },
    "note-kept": {
      from: "note-typed",
      about: "Enter keeps it and goes on; back shows it kept",
      steps: [
        { press: "Enter" },
        asserts("Add caching?"),
        { press: "b" },
        asserts("Note: keep the flag"),
      ],
    },
    "note-edit": {
      from: "note-kept",
      about: "n reopens the kept note",
      steps: [{ press: "n" }, asserts("note › keep the flag")],
    },
    "note-key": {
      from: "open",
      about: "n before an answer opens a note",
      steps: [{ press: "n" }, { wait: "note ›" }],
    },
    "note-click": {
      from: "open",
      about: "a click on the `n note` chip",
      steps: [{ click: "n note" }, { wait: "note ›" }],
    },
    "note-paste": {
      from: "pick",
      about: "a pasted two-line note; the field is a single line",
      steps: [{ paste: "a\nb" }, asserts("note ›")],
    },

    // ---- the review

    review: {
      from: "open",
      about: "both questions answered, on the review",
      steps: [...keys("1", "Enter", "2", "Enter"), { wait: "enter fill the prompt" }],
    },
    "review-key": {
      from: "open",
      about: "r opens the review",
      steps: [{ press: "r" }, { wait: "enter fill the prompt" }],
    },
    "review-click": {
      from: "open",
      about: "a click on the `r review` chip",
      steps: [{ click: "r review" }, { wait: "enter fill the prompt" }],
    },
    "review-hover": {
      from: "review",
      about: "the pointer on the review's first row",
      steps: [{ hover: "1  Q1  A: SQLite" }],
    },
    "review-row": {
      from: "review",
      about: "a click on a review row goes back to that question",
      steps: [{ click: "2  Q2  B: No" }, asserts("2 B. No ✓")],
    },
    "review-row-key": {
      from: "review",
      about: "1 on the review goes back to the first question",
      steps: [{ press: "1" }, asserts("1 A. SQLite ✓")],
    },
    "review-note": {
      from: "review",
      about: "n on the review opens a note on the whole round",
      steps: [{ press: "n" }, { wait: "note ›" }],
    },
    "review-note-typed": {
      from: "review-note",
      about: "the round's note typed, then kept",
      steps: [{ type: "thanks" }, { press: "Enter" }, asserts("Note: thanks")],
    },
    "review-back": {
      from: "review",
      about: "b on the review goes back",
      steps: [{ press: "b" }, asserts("Add caching?")],
    },
    "fill-key": {
      from: "review",
      about: "Enter writes the reply into the editor",
      region: region.full,
      steps: [{ press: "Enter" }, { wait: "Q2: B" }],
    },
    "fill-click": {
      from: "review",
      about: "a click on `enter fill the prompt`",
      region: region.full,
      steps: [{ click: "enter fill the prompt" }, { wait: "Q2: B" }],
    },
    "review-empty": {
      from: "open",
      about: "the review with nothing answered",
      steps: [{ press: "r" }, { wait: "enter fill the prompt" }],
    },

    // ---- what the message holds

    many: {
      about: "twelve questions",
      start: turn("many"),
      steps: SOME("many", 12),
      extreme: true,
    },
    "many-late": {
      from: "many",
      about: "the ninth question",
      steps: keys(...Array.from({ length: 8 }, () => ["1", "Enter"]).flat()),
    },
    "many-review": {
      from: "many-late",
      about: "the review of twelve, eight answered",
      steps: [{ press: "r" }, { wait: "enter fill the prompt" }],
    },
    "long-title": {
      about: "a question title far longer than the width",
      start: turn("long-title"),
      steps: SOME("long-title", 1),
      extreme: true,
    },
    "long-option": {
      about: "options with very long text and detail",
      start: turn("long-option"),
      steps: SOME("long-option", 1),
      extreme: true,
    },
    "long-body": {
      about: "a question with thirty lines of body: the form scrolls",
      start: turn("long-body"),
      steps: SOME("long-body", 1),
      extreme: true,
    },
    "long-body-wheel": {
      from: "long-body",
      about: "the mouse wheel scrolls the body",
      steps: [{ run: (s) => s.term.write("\x1b[<65;20;10M\x1b[<65;20;10M\x1b[<65;20;10M") }],
    },
    "wide-chars": {
      about: "CJK, emoji and a ZWJ sequence in a title and options",
      start: turn("wide-chars"),
      steps: SOME("wide-chars", 1),
    },
    "table-code": {
      about: "a table and a code block in the question's body",
      start: turn("table-code"),
      steps: SOME("table-code", 1),
    },
    picks: {
      about: "a pick list: build it, or route it",
      start: turn("picks"),
      steps: [{ type: "ask" }, { press: "Enter" }, { wait: /Pick|Answer 2/ }, ...OPEN],
    },
    numbered: {
      about: "numbered questions with no options",
      start: turn("numbered"),
      steps: SOME("numbered", 2),
    },
  },
});
