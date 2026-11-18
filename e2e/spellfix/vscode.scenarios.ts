import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Turn } from "../lib/harness.ts";
import { vscodeScenarios } from "../lib/vscode-scenario.ts";
import type { VscodeStep } from "../lib/vscode-scenario.ts";

/** hunspell flags `teh` and `seperate`; the real hunspell on PATH answers, with several suggestions for `teh`. */
const ONE = "Please fix teh handler before it breaks";
const TWO = "Please fix teh handler, it should seperate the orders";
const LONG =
  "Before the release we need to go through every handler in the sync worker and check that each " +
  "one still retries after a 429, and in particular that teh backoff doubles the delay each time " +
  "and gives up after five tries, because the old behaviour silently dropped the job";

/** One stubbed reply, so the session starts: it starts on the first prompt or slash command. */
const reply: Turn = { text: "Hello from the stub." };
const haiku = (...words: string[]): Turn => ({
  match: "You check spelling",
  text: words.join("\n"),
});

const FIX_TEH = '<word text="teh" verdict="fix">the</word>';
const FIX_SEPARATE = '<word text="seperate" verdict="fix">separate</word>';

/** One of the driver's verbs in a process of its own, on this run's session. */
const cli = (...args: string[]) =>
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL("../vscode.ts", import.meta.url)), ...args],
    {
      encoding: "utf8",
    },
  );

/** A step that runs a verb of the driver in a process of its own (see `draft`). */
const via = (...args: string[]): VscodeStep => ({ run: async () => void cli(...args) });
const wait = (text: string): VscodeStep => via("wait", text, "30");
const click = (text: string): VscodeStep => via("click", text);

/** The first prompt starts the session; the draft is typed after its reply. */
const draft = (text: string): VscodeStep[] => [
  { type: "hello" },
  { press: "Enter" },
  wait("Hello from the stub"),
  // A draft typed in the process that started the window reaches the extension only once that
  // process has exited, so it is typed by a process of its own, as the CLI's verbs are.
  { run: async () => void cli("type", text) },
];

/** The mod's options: a personal dictionary in the run's folder (a relative path). */
const personal = {
  settings: {
    pluginConfigs: {
      spellfix: { options: { personalDictionary: "personal.dic" } },
      "spellfix@inline": { options: { personalDictionary: "personal.dic" } },
    },
  },
};

export default vscodeScenarios({
  plugin: "spellfix",
  harness: "vscode",
  scenarios: {
    band: {
      about: "the count above the prompt: two words flagged in the draft",
      start: { turns: [reply], plugins: ["spellfix"] },
      steps: [...draft(TWO), wait("2 misspelled")],
    },
    clean: {
      about: "a draft with nothing flagged: the quiet line that offers Haiku",
      start: { turns: [reply], plugins: ["spellfix"] },
      steps: [...draft("Please fix the handler"), wait("No misspellings")],
    },
    picker: {
      about: "the picker on `teh`: hunspell's suggestions and Haiku's",
      start: { turns: [reply, haiku(FIX_TEH)], plugins: ["spellfix"] },
      steps: [...draft(ONE), wait("1 misspelled"), click("Review"), wait("Haiku")],
    },
    nomodel: {
      about: "the picker when Haiku has no suggestion for the word",
      start: {
        turns: [reply, haiku('<word text="teh" verdict="unsure"/>')],
        plugins: ["spellfix"],
      },
      steps: [
        ...draft(ONE),
        wait("1 misspelled"),
        click("Review"),
        wait("Haiku has no suggestion"),
      ],
    },
    add: {
      about: "the picker with a personal dictionary set: Add word joins the actions",
      start: { turns: [reply, haiku(FIX_TEH)], plugins: ["spellfix"], ...personal },
      setup: (ctx) => ctx.write("personal.dic", "1\nkeepme\n"),
      steps: [...draft(ONE), wait("1 misspelled"), click("Review"), wait("Add word")],
    },
    fixed: {
      about: "after Fix all: the report with Undo and Dismiss",
      start: { turns: [reply, haiku(FIX_TEH, FIX_SEPARATE)], plugins: ["spellfix"] },
      steps: [
        ...draft(TWO),
        wait("2 misspelled"),
        click("Review"),
        wait("Fix all changes"),
        click("Fix all"),
        wait("Dismiss"),
      ],
    },
    long: {
      about: "a long context line round the word, in a narrow pane",
      start: { turns: [reply, haiku(FIX_TEH)], plugins: ["spellfix"] },
      steps: [...draft(LONG), wait("1 misspelled"), click("Review"), wait("Haiku")],
    },
  },
});
