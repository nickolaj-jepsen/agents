import { vscodeScenarios, type VscodeScenario, type VscodeStep } from "../lib/vscode-scenario.ts";
import { says } from "./fixture.ts";

const asks = (fixture: string): VscodeScenario["start"] => ({
  plugins: ["answer"],
  turns: [...says(fixture), { text: "Thanks, going with that." }],
});

const asked: VscodeStep[] = [
  { type: "ask" },
  { press: "Enter" },
  { wait: "Review answers", timeout: 30_000 },
];

export default vscodeScenarios({
  plugin: "answer",
  harness: "vscode",
  scenarios: {
    form: {
      about: "expanded question cards and live review in the transcript",
      start: asks("details"),
      steps: [...asked, { hover: "Which database should the journal use?" }],
    },
    chosen: {
      from: "form",
      about: "a selected option keeps its detail and updates the live review",
      steps: [{ click: "B" }, { wait: /Review answers\s+1\/3/ }],
    },
    write: {
      from: "form",
      about: "a write-in answer uses the native input inside its card",
      steps: [
        { click: "Write answer" },
        { click: "Write your own answer" },
        { type: "Use the existing schema." },
        { click: "Save" },
        { wait: "Answer: Use the existing schema." },
      ],
    },
    note: {
      from: "chosen",
      about: "a short note is edited and saved inside its card",
      steps: [
        { click: "Write note" },
        { click: "Add a condition or follow-up" },
        { type: "Use the managed instance." },
        { click: "Save" },
        { wait: "Edit note for Q1" },
      ],
    },
    "longer-note": {
      from: "note",
      about: "the composer saves a multiline note and restores its original draft",
      steps: [
        { click: "Message input" },
        { type: "Draft to keep." },
        { click: "Edit note for Q1" },
        { click: "Write longer note" },
        { wait: "Save note" },
        { click: "Message input" },
        { press: "End" },
        { press: "Shift+Enter" },
        { type: "Rotate the credentials first." },
        { click: "Save note" },
        { wait: /Use the managed instance\.\s+Rotate the credentials first\./ },
        {
          run: async (s) => {
            const draft = await s.evalInView<string>(
              "document.querySelector('[aria-label=\"Message input\"]')?.innerText",
            );
            if (draft !== "Draft to keep.")
              throw new Error(`Composer draft was ${JSON.stringify(draft)}`);
          },
        },
      ],
    },
    "long-body": {
      about: "the full question body is in the transcript",
      start: asks("long-body"),
      steps: [...asked, { wait: "Line 30" }],
    },
    "long-option": {
      about: "long option text can wrap beside its selection button",
      start: asks("long-option"),
      steps: asked,
    },
    many: {
      about: "the transcript can hold twelve expanded questions",
      start: asks("many"),
      steps: [...asked, { wait: "Question number 12" }],
    },
    picks: {
      about: "a numbered list still opens from its offer above the prompt",
      start: asks("picks"),
      steps: [
        { type: "ask" },
        { press: "Enter" },
        { wait: "Pick from 2 items" },
        { click: "Pick" },
        { wait: "default bar" },
      ],
    },
    recommended: {
      about: "a recommendation without multiple-choice options can still be accepted",
      start: asks("recommended"),
      steps: [...asked, { wait: "per-generator" }],
    },
    sent: {
      from: "longer-note",
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
