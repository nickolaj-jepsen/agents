import { vscodeScenarios, type VscodeScenario, type VscodeStep } from "../lib/vscode-scenario.ts";
import { says } from "./fixture.ts";

const asks = (fixture: string): VscodeScenario["start"] => ({
  plugins: ["answer"],
  turns: [...says(fixture), { text: "Thanks, going with that." }],
});

const asked: VscodeStep[] = [
  { type: "ask" },
  { press: "Enter" },
  { wait: /0\/\d+ answered/, timeout: 30_000 },
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
        { click: /○\s+B\s+Postgres/ },
        { wait: /●\s+B\s+Postgres/ },
        { wait: "1/3 answered" },
        { wait: "Clear answer" },
      ],
    },
    write: {
      from: "form",
      about: "Enter saves a write-in in place without sending the chat draft",
      steps: [
        { click: "Message input" },
        { type: "Unsent chat draft." },
        { click: "Write your own answer" },
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
        { click: "Write your own answer" },
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
        { click: /○\s+B\s+Option B for 2/ },
        { wait: "2/12 answered" },
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
        { wait: "0/3 answered" },
        { wait: "Use the managed instance." },
        { wait: "Edit note" },
      ],
    },
    "long-title": {
      about: "a very long heading wraps beside the question number and answer mark",
      start: asks("long-title"),
      size: [420, 800],
      steps: [...asked, { click: /○\s+A\s+Yes/ }, { wait: "1/1 answered" }],
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
        { click: /○\s+Route to \/grill-me/ },
        { wait: /●\s+Route to \/grill-me/ },
        { wait: "1/2 answered" },
      ],
    },
    "recommend-no": {
      about: "a recommendation of No is a choice, not an affirmative answer",
      start: asks("recommend-no"),
      steps: [
        ...asked,
        { click: /○\s+No\s+A plain reply is enough/ },
        { wait: /●\s+No\s+A plain reply is enough/ },
      ],
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
