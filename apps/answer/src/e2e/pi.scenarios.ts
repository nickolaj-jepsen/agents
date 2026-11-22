import { region, type Region } from "@agents/drive/lib/screen.ts";
import { scenarios, type Scenario, type Step } from "@agents/drive/lib/scenario.ts";
import { message, says } from "./fixture.ts";

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
const REVIEW = withoutScrollbar(region.rows(/^│\s+(?:❯ )?\d+ of \d+ answered/, promptRule));
const FULL_CARD = withoutScrollbar(region.full);

export default scenarios({
  plugin: "answer",
  harness: "pi",
  region: CARD,
  scenarios: {
    // ---- fullscreen transcript cards

    "cards-open": {
      about: "the active card appears without taking the keys from the prompt",
      start: cards("two-q"),
      region: CARD,
      steps: [...CARD_ASK, { wait: "❯ Q1  Use SQLite?" }, { type: "a draft for later" }],
    },
    "cards-menu": {
      about: "a list of alternatives is one card whose rows keep the list's numbers",
      start: cards("menu"),
      region: FULL_CARD,
      steps: [...CARD_ASK, { wait: /1 ○ Accept it/ }],
    },
    "cards-lone": {
      about: "one question with lettered options is one card, not a round",
      start: cards("lone"),
      region: FULL_CARD,
      steps: [...CARD_ASK, { wait: /B .*On disk/ }],
    },
    "cards-revisited": {
      about:
        "a question come back to, an option that is only its letter, and numbered questions under the last one are all cards",
      start: cards("revisited"),
      region: FULL_CARD,
      size: [96, 44],
      steps: [
        ...CARD_ASK,
        { wait: /Q3 +Who holds the spare key/ },
        { wait: /2 +Is the slab still sound/ },
      ],
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
        { wait: "❯ 2 of 2 answered" },
        // From the last step, k goes back to the last question and j comes back.
        { press: "k" },
        { wait: "❯ Q2  Add caching?" },
        { press: "j" },
        { wait: "❯ 2 of 2 answered" },
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
        { wait: "2 of 2 answered ✓ Sent" },
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
    "cards-review-stress": {
      from: "cards-stress",
      about: "the closing row of a twelve-question round, with a long multilingual round note",
      region: REVIEW,
      extreme: true,
      steps: [
        { press: "r" },
        { wait: "❯ 1 of 12 answered" },
        { press: "n" },
        { wait: "Save ↵" },
        {
          paste:
            "Roll 東京 and 大阪 out together once the replicas agree, and keep the old routing a week longer.",
        },
        { press: "Enter" },
        { wait: "Save ↵", gone: true },
        { wait: "Roll 東京" },
      ],
    },
    "cards-count-click": {
      about: "a click on the closing row's count goes to the first question, at the round's top",
      start: cards("many"),
      region: CARD,
      steps: [
        ...CARD_ASK,
        { press: "Ctrl+End" },
        { hover: "0 of 12 answered" },
        { click: "0 of 12 answered" },
        { wait: "❯ Q1  Question number 1" },
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
      about: "the regular terminal shows the cards too, and the guide's keys drive them",
      start: cards("two-q", "--tui-mode", "regular"),
      region: region.full,
      steps: [
        ...CARD_ASK,
        { press: "Alt+a" },
        { wait: "jk move" },
        { press: "b" },
        { wait: "B ● Postgres" },
      ],
    },
    none: {
      about: "a turn that asked nothing: no cards, and /answer says so",
      start: cards("none"),
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

    // ---- other kinds of round, as cards

    "recommend-no": {
      about: "a recommendation of No is a choice, not an affirmative answer",
      start: cards("recommend-no"),
      steps: [
        ...CARD_ASK,
        { click: "A ○ No. A plain reply is enough." },
        { wait: "A ● No. A plain reply is enough." },
      ],
    },
    recommended: {
      about: "three questions with recommendations",
      start: cards("recommended"),
      region: FULL_CARD,
      steps: [...CARD_ASK, { wait: /❯ Q1  / }],
    },
    numbered: {
      about: "numbered questions with no options",
      start: cards("numbered"),
      region: FULL_CARD,
      steps: [...CARD_ASK, { wait: /❯ \d+  / }],
    },
    picks: {
      about: "a pick list: build it, or route it",
      start: cards("picks"),
      region: FULL_CARD,
      steps: [...CARD_ASK, { wait: /❯ \d+  / }],
    },
  },
});
