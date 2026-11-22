import {
  vscodeScenarios,
  type VscodeScenario,
  type VscodeStep,
} from "@agents/drive/lib/vscode-scenario.ts";
import { says } from "./fixture.ts";

const asks = (fixture: string): VscodeScenario["start"] => ({
  plugins: ["answer"],
  turns: [...says(fixture), { text: "Thanks, going with that." }],
});

const asked: VscodeStep[] = [
  { type: "ask" },
  { press: "Enter" },
  { wait: /0 of \d+ answered/, timeout: 30_000 },
];

export default vscodeScenarios({
  plugin: "answer",
  harness: "vscode",
  scenarios: {
    form: {
      about: "all question cards stay in the transcript with a single progress footer",
      start: asks("details"),
      steps: [
        ...asked,
        { wait: "Keep the journal?" },
        { wait: "Review answers", gone: true },
        { hover: "Which database should the journal use?" },
      ],
    },
    chosen: {
      from: "form",
      about: "a selected option keeps its detail and updates the footer",
      steps: [
        // An answer is a Button of its letter: the first B is Q1's.
        { click: { text: /^B$/, nth: 0 } },
        { wait: "1 of 3 answered" },
        { wait: "Clear answer" },
      ],
    },
    write: {
      from: "form",
      about: "Enter saves a write-in in place without sending the chat draft",
      steps: [
        { click: "Message input" },
        { type: "Unsent chat draft." },
        // The write-in's letter follows the options: Q1 has three.
        { click: { text: /^D$/, nth: 0 } },
        { click: "Type an answer" },
        { type: "Use the existing schema." },
        { press: "Enter" },
        { wait: "Answer: Use the existing schema." },
        { wait: "Unsent chat draft." },
      ],
    },
    "editing-many": {
      about: "editing a long write-in leaves the other eleven questions interactive",
      start: asks("many"),
      size: [420, 800],
      steps: [
        ...asked,
        // Q1 has two options, so its write-in is C.
        { click: { text: /^C$/, nth: 0 } },
        { click: "Type an answer" },
        { type: "数据库 / café / follow the existing migration plan. ".repeat(15).trim() },
        { click: "Add line" },
        { click: "Line 2" },
        { type: "Keep the current indexes." },
      ],
    },
    "pick-while-editing": {
      from: "editing-many",
      about: "picking on another card keeps both lines and applies the choice",
      steps: [
        { click: { text: /^B$/, nth: 1 } },
        { wait: "2 of 12 answered" },
        { wait: /Answer: 数据库.*\s+Keep the current indexes\./ },
      ],
    },
    "note-open": {
      from: "chosen",
      about: "the inline note editor leaves the choices and chat draft alone",
      steps: [
        { click: "Message input" },
        { type: "Draft to keep." },
        { click: "Add note" },
        { wait: "Add line" },
        { wait: "Clear answer" },
        { wait: "Send reply" },
      ],
    },
    note: {
      from: "note-open",
      about: "save and reopen a multiline note on the same card",
      steps: [
        { click: "Type a note" },
        { type: "Use the managed instance." },
        { click: "Add line" },
        { click: "Line 2" },
        { type: "Rotate the credentials first." },
        { click: /^Save$/ },
        { wait: /Use the managed instance\.\s+Rotate the credentials first\./ },
        { wait: "Draft to keep." },
      ],
    },
    "cancel-note": {
      from: "note",
      about: "cancelling leaves both saved note lines and the chat draft intact",
      steps: [
        { click: "Edit note" },
        { click: "Line 2" },
        { press: "Ctrl+a" },
        { type: "A change to discard" },
        { click: "Cancel" },
        { wait: "A change to discard", gone: true },
        { wait: "Rotate the credentials first." },
        { wait: "Draft to keep." },
      ],
    },
    "clear-with-note": {
      from: "note",
      about: "clearing a choice leaves the question's note in place",
      steps: [
        { click: "Clear answer" },
        { wait: "0 of 3 answered" },
        { wait: "Use the managed instance." },
        { wait: "Edit note" },
      ],
    },
    "long-title": {
      about: "a very long heading wraps beside the question number and answer mark",
      start: asks("long-title"),
      size: [420, 800],
      steps: [...asked, { click: { text: /^A$/, nth: 0 } }, { wait: "1 of 1 answered" }],
    },
    "long-body": {
      about: "the full question body is in the transcript",
      start: asks("long-body"),
      steps: [...asked, { wait: "Line 30" }],
    },
    "long-option": {
      about: "long options wrap in place without hiding their labels or details",
      start: asks("long-option"),
      size: [420, 800],
      steps: [...asked, { wait: /a very long option text that keeps going/ }],
    },
    many: {
      about: "12 questions, including eight options on one card, without a review step",
      start: asks("many"),
      steps: [...asked, { wait: "Question number 12" }, { wait: "Review answers", gone: true }],
    },
    picks: {
      about: "a numbered pick list is cards in the transcript, as a round is",
      start: asks("picks"),
      steps: [
        ...asked,
        { wait: "default bar" },
        // Q1 has a row and the write-in (A, B); Q2's second row is the second B.
        { click: { text: /^B$/, nth: 1 } },
        { wait: "1 of 2 answered" },
      ],
    },
    menu: {
      about: "a list of alternatives is one card whose rows keep the list's numbers",
      start: asks("menu"),
      steps: [...asked, { wait: "Accept it and label it" }],
    },
    lone: {
      about: "one question with lettered options is one card, not a round",
      start: asks("lone"),
      steps: [...asked, { wait: "where the cache lives" }, { wait: /On disk/ }],
    },
    closing: {
      about: "what the message says after its last question is drawn under the cards",
      start: asks("closing"),
      steps: [...asked, { wait: "shared understanding" }, { wait: "write the plan to the notes" }],
    },
    numbered: {
      about: "numbered questions with write-in answers only",
      start: asks("numbered"),
      steps: [...asked, { wait: "Should we use a monorepo?" }, { wait: "Pick a license?" }],
    },
    revisited: {
      about:
        "a question come back to, an option that is only its letter, and numbered questions under the last one are all cards",
      start: asks("revisited"),
      steps: [...asked, { wait: "Who holds the spare key?" }, { wait: "Is the slab still sound?" }],
    },
    "recommend-no": {
      about: "a recommendation of No is a choice, not an affirmative answer",
      start: asks("recommend-no"),
      steps: [...asked, { click: { text: /^A$/, nth: 0 } }, { wait: "1 of 1 answered" }],
    },
    band: {
      about:
        "/answer opens the form above the prompt: a title and Close, the steps, the question, its answers and a note",
      start: asks("details"),
      steps: [
        ...asked,
        { type: "/answer" },
        { press: "Enter" },
        { wait: "Close" },
        // The transcript's three questions stand behind the form: its B is the fourth.
        { click: { text: /^B$/, nth: 3 } },
        { wait: "Next" },
      ],
    },
    "band-review": {
      from: "band",
      about:
        "the form's last step: each question with its answer, a note for the round, Send and Fill the prompt",
      steps: [{ click: /^Review$/ }, { wait: "Fill the prompt" }],
    },
    recommended: {
      about: "a recommendation without multiple-choice options can still be accepted",
      start: asks("recommended"),
      steps: [...asked, { wait: "per-generator" }],
    },
    filled: {
      from: "note",
      about: "fill copies the partial reply into the chat draft without sending it",
      steps: [
        { click: "Fill prompt" },
        { wait: /Postgres[\s\S]*Draft to keep\./ },
        { wait: "Thanks, going with that.", gone: true },
      ],
    },
    sent: {
      from: "note",
      about: "send a partial reply and keep the original questions and draft",
      steps: [
        { click: "Send reply" },
        { wait: "Thanks, going with that.", timeout: 30_000 },
        { wait: "Which database should the journal use?" },
        { wait: "Sent" },
        { wait: "Send reply", gone: true },
        { wait: "Draft to keep." },
      ],
    },
  },
});
