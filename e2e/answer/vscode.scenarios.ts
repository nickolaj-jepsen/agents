import { vscodeScenarios } from "../lib/vscode-scenario.ts";
import type { VscodeScenario } from "../lib/vscode-scenario.ts";
import { says } from "./fixture.ts";

/** The turn the questions come from, then the model's answer to the reply that is sent. */
const asks = (fixture: string): VscodeScenario["start"] => ({
  turns: [...says(fixture), { text: "Thanks, going with that." }],
});

/** The turn, and the offer it leaves above the prompt. */
const ASKED = (words: RegExp | string) => [
  { type: "ask" },
  { press: "Enter" },
  { wait: words, timeout: 30_000 },
];

/** A click on the offer's button opens the form. */
const OPEN = (first: string) => [{ click: "Answer" }, { wait: first }];

export default vscodeScenarios({
  plugin: "answer",
  harness: "vscode",
  scenarios: {
    offer: {
      about: "a turn that asked three questions: the status band above the prompt",
      start: asks("details"),
      steps: ASKED("Answer 3 questions"),
    },
    form: {
      about: "the form on a single-choice question whose options carry detail text",
      start: asks("details"),
      steps: [...ASKED("Answer 3 questions"), ...OPEN("Which database")],
    },
    chosen: {
      from: "form",
      about: "an option chosen: it is filled, and the note field opens under the options",
      // The field's words are its placeholder, which no text wait sees.
      steps: [{ click: "Postgres" }, { sleep: 1000 }],
    },
    several: {
      from: "form",
      about: "a multi-choice question: two options taken, both filled",
      steps: [
        { click: "Q2" },
        { wait: "Which checks" },
        { click: "Pick several" },
        { click: "Lint" },
        { click: "Tests" },
      ],
    },
    write: {
      from: "form",
      about: "write your own: the field is open and an answer is being typed",
      steps: [
        { click: "Write your own" },
        { sleep: 1000 },
        // Focus is asked for, not taken: the field has no keys until it is clicked or focused.
        {
          run: async (s) => {
            await s.evalInView(
              `[...document.querySelectorAll("[placeholder]")].find((e) => e.placeholder === "Write your own answer").focus()`,
            );
            await s.type("Something between the two, generated from the schema, and kept in sync.");
          },
        },
      ],
    },
    "long-body": {
      about: "a question whose body runs to thirty lines",
      start: asks("long-body"),
      steps: [...ASKED("Answer 1 question"), ...OPEN("Keep the journal")],
    },
    "long-option": {
      about: "options whose text is far longer than a button",
      start: asks("long-option"),
      steps: [...ASKED("Answer 1 question"), ...OPEN("Which one")],
    },
    review: {
      from: "form",
      about: "the review: two answered, one not, and the reply",
      steps: [
        { click: "SQLite" },
        { sleep: 1000 },
        { click: "Next" },
        { wait: "Which checks" },
        { click: "Lint" },
        { click: "Review" },
        { wait: "Reply" },
      ],
    },
    sent: {
      from: "review",
      about: "after Send: the reply is the person's message and the form is gone",
      steps: [{ click: "Send" }, { wait: "Thanks, going with that.", timeout: 30_000 }],
    },
  },
});
