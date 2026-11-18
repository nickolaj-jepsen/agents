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

/** A click on the offer's button opens the form; the pointer then leaves, so no button shows its hover. */
const OPEN = (first: string, way = "Answer") => [
  { click: way },
  { wait: first },
  { hover: "From the answer plugin" },
];

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
      about: "an option chosen: its row opens in place, its detail whole, a note's field and Next",
      // An option is pressed by the Button of its letter; the field's words are its placeholder.
      steps: [{ click: "B" }, { sleep: 1000 }],
    },
    several: {
      from: "form",
      about: "a multi-choice question: two options taken, both filled, Next on the action row",
      steps: [
        { click: "Q2" },
        { wait: "Which checks" },
        { click: "Pick several" },
        { click: "A" },
        { click: "C" },
      ],
    },
    write: {
      from: "form",
      about: "write your own: a click lands in the field, and an answer is being typed",
      steps: [
        // The field is always drawn, so a real click puts the keys in it; nothing else focuses it.
        { click: "Write your own answer" },
        { type: "Something between the two, generated from the schema, and kept in sync." },
      ],
    },
    note: {
      from: "form",
      about: "a chosen answer with a note: kept with Enter, which goes on, then back to it",
      steps: [
        { click: "B" },
        { sleep: 1000 },
        { click: "Add a note" },
        { type: "Only if the team already runs one." },
        { press: "Enter" },
        { wait: "Which checks" },
        { click: "Q1" },
        { wait: "Which database" },
      ],
    },
    "long-body": {
      about: "a question whose body runs to thirty lines",
      start: asks("long-body"),
      steps: [...ASKED("Answer 1 question"), ...OPEN("Keep the journal")],
    },
    "long-body-open": {
      from: "long-body",
      about: "the long body opened whole in its well",
      steps: [{ click: "More" }, { wait: "Line 30" }],
    },
    "long-option": {
      about: "options whose text is far longer than a button",
      start: asks("long-option"),
      steps: [...ASKED("Answer 1 question"), ...OPEN("Which one")],
    },
    "long-option-chosen": {
      from: "long-option",
      about: "the long option chosen: its words whole in the well",
      steps: [{ click: "A" }, { sleep: 1000 }],
    },
    many: {
      about: "twelve questions: the tabs wrap under one another",
      start: asks("many"),
      steps: [...ASKED("Answer 12 questions"), ...OPEN("Question number 1")],
    },
    picks: {
      about: "a pick list: each item routed by a Button of its own words",
      start: asks("picks"),
      steps: [...ASKED("Pick from 2 items"), ...OPEN("default bar", "Pick")],
    },
    recommended: {
      about: "a question with no options, only a recommendation: one Yes row and the write-in",
      start: asks("recommended"),
      steps: [
        ...ASKED("Answer 3 questions"),
        ...OPEN("same bar"),
        { click: "Q2" },
        { wait: "per-generator" },
      ],
    },
    review: {
      from: "form",
      about: "the review: two answered, one not, and the reply",
      steps: [
        { click: "A" },
        { sleep: 1000 },
        { click: "Next" },
        { wait: "Which checks" },
        { click: "A" },
        { sleep: 1000 },
        { click: "Review" },
        { wait: "Not answered" },
      ],
    },
    sent: {
      from: "review",
      about: "after Send: the reply is the person's message and the form is gone",
      steps: [{ click: "Send" }, { wait: "Thanks, going with that.", timeout: 30_000 }],
    },
  },
});
