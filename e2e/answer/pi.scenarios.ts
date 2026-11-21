import { region, type Region } from "../lib/screen.ts";
import { scenarios, type Scenario, type Step } from "../lib/scenario.ts";
import { message, says } from "./fixture.ts";

/**
 * The open form, from its top border to its keys (it has no bottom border: the prompt's rule is
 * its floor), or the one line the widget draws while it is closed.
 */
const surface: Region = region.any(
  region.rows(/^\s*╭─/, /1-9|esc /),
  region.rows(/Answer \d+ questions?|Pick \d/, /Answer \d+ questions?|Pick \d/),
);

/** One step per key: a key sent before the last one settled can be lost. */
const keys = (...names: string[]): Step[] => names.map((press) => ({ press }));

const ASKED: Step[] = [{ type: "ask" }, { press: "Enter" }, { wait: /Answer \d+ questions?/ }];
/** alt+a opens the form in the editor's place. */
const OPEN: Step[] = [{ press: "Alt+a" }, { wait: /1-9/ }];
const turn = (fixture: string): Scenario["start"] => ({
  hermetic: true,
  plugins: ["answer"],
  args: ["--answer-guided"],
  turns: says(fixture),
});
const cards = (fixture: string, ...args: string[]): Scenario["start"] => ({
  hermetic: true,
  plugins: ["answer"],
  args,
  turns: says(fixture),
});
const CARD_ASK: Step[] = [{ type: "ask" }, { press: "Enter" }, { wait: "Answer [alt+a]" }];
// pi's scrollbar appears on the last column, then hides on its own timer.
const withoutScrollbar =
  (area: Region): Region =>
  (grid) => {
    const rect = area(grid);
    return rect && { ...rect, w: rect.w - 1 };
  };
const promptRule = /^─{20,}/;
const CARD = withoutScrollbar(region.rows(/^│\s+(?:❯ )?Q1  /, promptRule));
const REVIEW = withoutScrollbar(region.rows(/^│\s+Answers /, promptRule));
const FULL_CARD = withoutScrollbar(region.full);
const asserts = (pattern: RegExp | string): Step => ({ wait: pattern });
/** The guided form on Q2: its own title row, as the transcript above shows `Q2. Add caching?` too. */
const ON_Q2 = /│ Add caching\?/;
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
    // ---- fullscreen transcript cards

    "cards-open": {
      about: "the active card appears without taking the keys from the prompt",
      start: cards("two-q"),
      region: CARD,
      steps: [...CARD_ASK, { wait: "❯ Q1  Use SQLite?" }, { type: "a draft for later" }],
    },
    "cards-hover": {
      from: "cards-open",
      about: "hover a transcript choice without picking it or touching the prompt draft",
      region: CARD,
      steps: [{ hover: "B ○ Postgres" }, { wait: "a draft for later" }],
    },
    "cards-click": {
      from: "cards-open",
      about: "a click records a choice and leaves that card active",
      region: CARD,
      steps: [{ click: "B ○ Postgres" }, { wait: "B ● Postgres" }, { wait: "a draft for later" }],
    },
    "cards-note": {
      from: "cards-click",
      about: "a multiline note saves without changing the prompt draft",
      region: FULL_CARD,
      steps: [
        { click: "Add a note" },
        { wait: "Save ↵" },
        { type: "keep the flag" },
        { press: "Shift+Enter" },
        { type: "check the results" },
        { press: "Enter" },
        // The editor showed the note as it was typed: its key hint going proves the save.
        { wait: "Save ↵", gone: true },
        { wait: "check the results" },
        { wait: "a draft for later" },
      ],
    },
    "cards-editing": {
      from: "cards-click",
      about: "a note edits inline above the untouched composer",
      region: FULL_CARD,
      steps: [
        { click: "Note: Add a note" },
        { wait: "Save ↵" },
        { type: "draft note" },
        { wait: "Note: draft note" },
        { click: "a draft for later" },
        { wait: "Resume editing [alt+a]" },
        { click: "draft note" },
        { wait: "shift+enter newline" },
        { wait: "a draft for later" },
      ],
    },
    "cards-clear": {
      from: "cards-note",
      about: "clearing the choice keeps its note",
      region: CARD,
      steps: [{ click: "B ● Postgres" }, { wait: "B ○ Postgres" }, { wait: "check the results" }],
    },
    "cards-keys": {
      from: "cards-open",
      about: "the guide picks a choice and navigates question cards without losing the prompt",
      region: REVIEW,
      steps: [
        { press: "Alt+a" },
        { wait: "jk move" },
        { press: "2" },
        { wait: "B ● Postgres" },
        { press: "j" },
        { wait: "❯ Q2  Add caching?" },
        { press: "a" },
        { wait: "A ● Yes" },
        { press: "k" },
        { wait: "❯ Q1  Use SQLite?" },
        { press: "r" },
        { wait: "Answers  2 of 2 answered" },
        { wait: "Hide questions" },
      ],
    },
    "cards-guide-buttons": {
      from: "cards-open",
      about: "the keyboard-only hint does not navigate; the guide's Note and Save buttons do",
      region: CARD,
      steps: [
        { press: "Alt+a" },
        { wait: "jk move" },
        { click: "jk move" },
        { wait: "❯ Q1  Use SQLite?" },
        { click: "Note [n]" },
        { wait: "Save ↵" },
        { type: "Check the migration" },
        { click: "Save ↵" },
        { wait: "Save ↵", gone: true },
        { wait: "Note: Check the migration" },
        { wait: "a draft for later" },
      ],
    },
    "cards-review-click": {
      from: "cards-click",
      about: "the review expands and collapses without taking the keys",
      region: REVIEW,
      steps: [
        { click: "Show all 2 questions" },
        { wait: "Unanswered" },
        { wait: "Answer [alt+a]" },
        { click: "Hide questions" },
        { wait: "Unanswered", gone: true },
        { wait: "Show all 2 questions" },
        { wait: "a draft for later" },
        { click: "Show all 2 questions" },
        { wait: "Hide questions" },
      ],
    },
    "cards-review-row": {
      from: "cards-keys",
      about: "a review row takes you back to its question",
      region: CARD,
      steps: [{ click: "B: Postgres" }, { wait: "❯ Q1  Use SQLite?" }],
    },
    "cards-write-editing": {
      from: "cards-open",
      about: "the write-in replaces its choice row while the composer draft stays visible",
      region: FULL_CARD,
      steps: [
        { click: "C ○ Write your own answer" },
        { wait: "C ›" },
        { type: "DuckDB" },
        { wait: "C › DuckDB" },
        { wait: "a draft for later" },
      ],
    },
    "cards-write": {
      from: "cards-open",
      about: "keyboard write-in cancels without saving, then keeps a multiline answer",
      region: CARD,
      steps: [
        { press: "Alt+a" },
        { wait: "jk move" },
        { click: "C ○ Write your own answer" },
        { wait: "C ›" },
        { type: "not this" },
        { wait: "C › not this" },
        { press: "Escape" },
        { wait: "jk move" },
        { press: "c" },
        { wait: "C ›" },
        { paste: "DuckDB\nembedded is fine" },
        { press: "Enter" },
        { wait: "❯ Q2  Add caching?" },
        { press: "k" },
        { wait: "embedded is fine" },
        { press: "Escape" },
        { wait: "a draft for later" },
      ],
    },
    "cards-recommendation": {
      about: "a bundled recommendation can be accepted, but individual choices are single-select",
      start: cards("several"),
      region: CARD,
      steps: [
        ...CARD_ASK,
        { press: "Alt+a" },
        { wait: "Take recommendation [y]" },
        { press: "y" },
        { wait: /A ■/ },
        { wait: /C ■/ },
      ],
    },
    "cards-fill": {
      from: "cards-keys",
      about: "fill places the reply above the draft and returns the keyboard",
      region: FULL_CARD,
      steps: [
        { click: "Fill prompt" },
        { wait: "Q2: A" },
        { wait: "a draft for later" },
        { wait: "Answer [alt+a]" },
      ],
    },
    "cards-send": {
      from: "cards-keys",
      about: "send freezes the submitted round, but leaves the prompt draft alone",
      region: FULL_CARD,
      steps: [
        { press: "s" },
        { wait: "Answers  2 of 2 answered ✓ Sent" },
        { wait: "a draft for later" },
        { wait: "Q2: A" },
      ],
    },
    "cards-reopen": {
      from: "cards-click",
      about: "a different message sets the round aside; /answer restores its answers",
      region: CARD,
      steps: [
        { press: "Enter" },
        { wait: "Answer [alt+a]", gone: true },
        { type: "/answer" },
        { press: "Enter" },
        { wait: "jk move" },
        { wait: "B ● Postgres" },
      ],
    },
    "cards-reload": {
      from: "cards-click",
      about: "reloading the extension restores the round without adding another card",
      region: CARD,
      steps: [
        { press: "Ctrl+u" },
        { type: "/reload" },
        { press: "Enter" },
        { wait: "Reloaded" },
        { press: "Alt+a" },
        { wait: "jk move" },
        { wait: "B ● Postgres" },
      ],
    },
    "cards-long": {
      about: "long options and details in a fullscreen card",
      start: cards("long-option"),
      region: CARD,
      steps: CARD_ASK,
      extreme: true,
    },
    "cards-markdown": {
      about: "an option's code, bold and link are set as the body's are",
      start: cards("inline-markdown"),
      region: CARD,
      steps: CARD_ASK,
    },
    "cards-stress": {
      about: "a long multilingual heading, choice and note in a twelve-question transcript",
      start: {
        ...cards("many"),
        turns: [
          {
            text: message("many")
              .replace(
                "Question number 1: pick a strategy?",
                `Which rollout should we use for ${"東京、大阪、名古屋 and the other regional clusters, ".repeat(3)}given the migration window?`,
              )
              .replace(
                "Option A for 1",
                `Canary: ${"validate the read replicas in 東京 and compare results before promoting. ".repeat(3)}`,
              ),
          },
        ],
      },
      region: CARD,
      extreme: true,
      steps: [
        ...CARD_ASK,
        { click: "Answer [alt+a]" },
        { wait: "jk move" },
        { press: "a" },
        { wait: "A ● Canary:" },
        { press: "n" },
        { wait: "Save ↵" },
        {
          paste:
            "Keep 東京 on the old routing until the replicas catch up and the dashboards agree.\nCheck 大阪 before widening the rollout.",
        },
        { press: "Enter" },
        // The editor showed the note as it was typed: its key hint going proves the save.
        { wait: "Save ↵", gone: true },
        { wait: "Check 大阪" },
      ],
    },
    "cards-review-closed": {
      from: "cards-stress",
      about: "the folded summary keeps the fill and expand controls visible",
      region: REVIEW,
      sizes: [[160, 45]],
      steps: [
        { press: "r" },
        { wait: "Hide questions" },
        { click: "Hide questions" },
        { wait: "Show all 12 questions" },
        { wait: "Hide questions", gone: true },
      ],
    },
    "cards-review-stress": {
      from: "cards-stress",
      about:
        "a review that fits whole rows on short screens, including a multilingual answer and note",
      region: REVIEW,
      extreme: true,
      steps: [
        { press: "r" },
        { wait: /Questions 1.[2-5] of 12/ },
        { press: "j" },
        { wait: "Open ↵" },
      ],
    },
    "cards-review-page": {
      about: "page buttons and j/k move the selection; Enter opens its question",
      start: cards("many"),
      region: REVIEW,
      steps: [
        ...CARD_ASK,
        { press: "Ctrl+End" },
        { wait: "Show all 12 questions" },
        { click: "Show all 12 questions" },
        { wait: /Questions 1.5 of 12/ },
        { click: "Next" },
        { wait: "❯ Q6" },
        { click: "Previous" },
        { wait: "❯ Q1" },
        { press: "Alt+a" },
        { press: "k" },
        { wait: "❯ Q12" },
        { press: "j" },
        { wait: "❯ Q1" },
        { press: "j" },
        { wait: "❯ Q2" },
        { press: "Enter" },
        { wait: "02/12" },
        { press: "r" },
        { wait: "Hide questions" },
      ],
    },
    "cards-reference": {
      about:
        "the reference screen: answered Q1 with a note, active Q2 with a write-in, and Q3 below",
      start: cards("many"),
      size: [62, 38],
      sizes: [[62, 38]],
      region: CARD,
      steps: [
        ...CARD_ASK,
        { press: "Alt+a" },
        { press: "a" },
        { press: "n" },
        { wait: "Save ↵" },
        { type: "test test" },
        { press: "Enter" },
        { wait: "Note: test test" },
        { press: "j" },
        { press: "c" },
        { wait: "C ›" },
        { type: "test est" },
        { press: "Enter" },
        { wait: "03/12" },
        { press: "k" },
        { press: "k" },
        { press: "j" },
        { wait: "❯ Q2" },
        { wait: "C ● test est" },
        { wait: "02/12" },
      ],
    },
    "cards-regular": {
      about: "the regular terminal still offers the guided form",
      start: cards("two-q", "--tui-mode", "regular"),
      steps: [...ASKED, ...OPEN],
    },

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
    "open-by-click": {
      from: "collapsed",
      about: "a click on the offer row opens the form, and the row goes",
      steps: [
        { click: "alt+a or /answer" },
        { wait: /1-9/ },
        { wait: "alt+a or /answer", gone: true },
      ],
    },
    "prompt-click": {
      from: "open",
      about:
        "a click on the prompt gives it the keys: the form stays shown and says how to come back",
      // The prompt's own top rule: the form's two borders come first (nth counts from 0).
      steps: [{ click: { text: /─{20,}/, nth: 2 } }, { wait: "comes back here" }],
    },
    "prompt-back": {
      from: "prompt-click",
      about: "alt+a takes the keys back from the prompt",
      steps: [{ press: "Alt+a" }, { wait: /1-9 or enter/ }],
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
      steps: [{ hover: "2 ○ B. Postgres" }, asserts("›2")],
    },
    "hover-chip": {
      from: "open",
      about: "the label under the pointer in the footer turns bold",
      steps: [{ hover: "Skip [s]" }],
    },
    pick: {
      from: "open",
      about: "1 picks A and goes on to the second question",
      steps: [{ press: "1" }, asserts(ON_Q2)],
    },
    "pick-click": {
      from: "open",
      about: "a click picks B and opens its note, as a key goes on at once",
      steps: [{ click: "2 ○ B. Postgres" }, { wait: "note ›" }],
    },
    "pick-again": {
      from: "pick-click",
      about: "a click on the answer just taken goes on to the next question",
      steps: [{ click: "2 ● B. Postgres" }, asserts(ON_Q2)],
    },
    "note-open": {
      from: "pick",
      about: "back on the answered question, a click on `add a note` opens its field",
      steps: [{ press: "b" }, { click: "add a note" }, { wait: "note ›" }],
    },
    "pick-back": {
      from: "pick",
      about: "back on the answered question: A is marked and a note can be added",
      steps: [{ press: "b" }, asserts("● A. SQLite"), asserts("add a note")],
    },
    "forward-key": {
      from: "open",
      about: "f goes forward",
      steps: [{ press: "f" }, asserts(ON_Q2)],
    },
    "forward-click": {
      from: "open",
      about: "a click on the `f forward` chip",
      steps: [{ click: "Forward [f]" }, asserts(ON_Q2)],
    },
    "stop-click": {
      from: "open",
      about: "a click on a question's stop in the top border goes to that question",
      steps: [{ click: "○ Q2" }, asserts(ON_Q2), asserts("2 of 2")],
    },
    "forward-tab": {
      from: "open",
      about: "tab goes forward",
      steps: [{ press: "Tab" }, asserts(ON_Q2)],
    },
    "back-key": {
      from: "forward-key",
      about: "b goes back",
      steps: [{ press: "b" }, asserts("1 of 2")],
    },
    "back-click": {
      from: "forward-key",
      about: "a click on the `b back` chip",
      steps: [{ click: "Back [b]" }, asserts("1 of 2")],
    },
    "back-shift-tab": {
      from: "forward-key",
      about: "shift+tab goes back",
      steps: [{ press: "Shift+Tab" }, asserts("1 of 2")],
    },
    skip: {
      from: "open",
      about: "s skips the question",
      steps: [{ press: "s" }, asserts(ON_Q2)],
    },
    "skip-click": {
      from: "open",
      about: "a click on the Skip button",
      steps: [{ click: "Skip [s]" }, asserts(ON_Q2)],
    },
    close: {
      from: "pick",
      about: "esc closes the form; the answer stays counted",
      steps: [{ press: "Escape" }, { wait: /1 answered/ }],
    },
    reopen: {
      from: "close",
      about: "reopened with the answer kept",
      steps: [{ press: "Alt+a" }, asserts(ON_Q2)],
    },
    "keys-walk": {
      from: "open",
      about: "every key of the keys row, each checked on the screen, ending on the review",
      steps: [
        { press: "1" },
        asserts(ON_Q2),
        { press: "b" },
        asserts("● A. SQLite"),
        { press: "s" },
        asserts(ON_Q2),
        { press: "h" },
        { press: "n" },
        asserts("note ›"),
        { press: "Escape" },
        { press: "r" },
        { wait: "Fill the prompt ↵" },
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
        asserts(ON_Q2),
        { press: "Left" },
        asserts("1 of 2"),
        { press: "l" },
        asserts(ON_Q2),
      ],
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
    "recommended-yes": {
      from: "recommended",
      about: "y takes the recommendation and goes on",
      steps: [{ press: "y" }, asserts("2 of 3")],
    },
    "recommended-yes-click": {
      from: "recommended",
      about: "a click on the `y take` chip",
      steps: [{ click: /Take .*\[y\]/ }, asserts("2 of 3")],
    },
    "write-in": {
      from: "open",
      about: "3 opens the write-in field",
      steps: [{ press: "3" }, { wait: "esc leaves the field" }],
    },
    "write-typed": {
      from: "write-in",
      about: "an answer typed into the write-in",
      steps: [{ type: "DuckDB, it is embedded" }],
    },
    "write-kept": {
      from: "write-typed",
      about: "Enter keeps it and goes on",
      steps: [{ press: "Enter" }, asserts(ON_Q2)],
    },
    "write-click": {
      from: "open",
      about: "a click on the write-in row opens its field",
      steps: [{ click: "3 ○ Write your own answer" }, { wait: "esc leaves the field" }],
    },

    // ---- notes

    "note-typed": {
      from: "note-open",
      about: "a note typed on one line",
      steps: [{ type: "keep the flag" }, asserts("keep the flag")],
    },
    "note-long": {
      from: "note-open",
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
      steps: [{ press: "Enter" }, asserts(ON_Q2), { press: "b" }, asserts("Note: keep the flag")],
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
      steps: [{ click: "Note [n]" }, { wait: "note ›" }],
    },
    "note-paste": {
      from: "note-open",
      about: "a pasted two-line note; the field is a single line",
      steps: [{ paste: "a\nb" }, asserts("note ›")],
    },

    // ---- the review

    review: {
      from: "open",
      about: "both questions answered, on the review",
      steps: [...keys("1", "2"), { wait: "Fill the prompt ↵" }],
    },
    "review-key": {
      from: "open",
      about: "r opens the review",
      steps: [{ press: "r" }, { wait: "Fill the prompt ↵" }],
    },
    "review-click": {
      from: "open",
      about: "a click on the Review button",
      steps: [{ click: "Review [r]" }, { wait: "Fill the prompt ↵" }],
    },
    "review-hover": {
      from: "review",
      about: "the pointer on the review's first row",
      steps: [{ hover: "→ A: SQLite" }],
    },
    "review-row": {
      from: "review",
      about: "a click on a review row goes back to that question",
      steps: [{ click: "→ B: No" }, asserts("● B. No")],
    },
    "review-row-key": {
      from: "review",
      about: "1 on the review goes back to the first question",
      steps: [{ press: "1" }, asserts("● A. SQLite")],
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
      steps: [{ press: "b" }, asserts(ON_Q2)],
    },
    "fill-key": {
      from: "review",
      about: "Enter writes the reply into the editor",
      region: region.full,
      steps: [{ press: "Enter" }, { wait: "Q2: B" }],
    },
    send: {
      from: "review",
      about: "s sends the reply as a message: the editor is left alone",
      region: region.full,
      steps: [{ press: "s" }, { wait: "Q2: B" }],
    },
    "fill-click": {
      from: "review",
      about: "a click on `Fill the prompt ↵`",
      region: region.full,
      steps: [{ click: "Fill the prompt ↵" }, { wait: "Q2: B" }],
    },
    "review-empty": {
      from: "open",
      about: "the review with nothing answered",
      steps: [{ press: "r" }, { wait: "Fill the prompt ↵" }],
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
      steps: keys(...Array.from({ length: 8 }, () => "1")),
    },
    "many-review": {
      from: "many-late",
      about: "the review of twelve, eight answered",
      steps: [{ press: "r" }, { wait: "Fill the prompt ↵" }],
    },
    "long-title-review": {
      from: "long-title",
      about: "the review of a question whose title is far longer than the width",
      steps: [{ press: "1" }, { wait: "Fill the prompt ↵" }],
      extreme: true,
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
    "form-markdown": {
      about: "the form sets an option's, a detail's and the recommendation's markdown",
      start: cards("inline-markdown", "--answer-guided"),
      steps: SOME("inline-markdown", 1),
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
