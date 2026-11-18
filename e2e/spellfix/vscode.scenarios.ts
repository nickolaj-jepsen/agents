import type { Turn } from "../lib/harness.ts";
import { vscodeScenarios } from "../lib/vscode-scenario.ts";
import type { VscodeStep } from "../lib/vscode-scenario.ts";

/**
 * Each scenario ends with the draft typed. VS Code raises no prompt events; the mod reads the draft
 * on each redraw, and (observed on 2.1.327) the redraws for a draft typed by the process that started
 * the window arrive only once that process has exited, so nothing here waits for the band. Look at
 * the state with the driver's verbs afterwards: `wait "2 misspelled"`, `click Review`, `shot`.
 */

/** hunspell flags `teh` and `seperate`; the real hunspell on PATH answers, with five suggestions for `teh`. */
const ONE = "Please fix teh handler before it breaks";
const TWO = "Please fix teh handler, it should seperate the orders";
const LONG =
  "Before the release we need to go through every handler in the sync worker and check that each " +
  "one still retries after a 429, and in particular that teh backoff doubles the delay each time " +
  "and gives up after five tries, because the old behaviour silently dropped the job";

/** One stubbed reply, so the session starts: it starts on the first prompt or slash command. */
const reply: Turn = { text: "Hello from the stub." };
/** Haiku's answer to the batch call, whichever request it comes with. */
const haiku = (...words: string[]): Turn => ({
  match: "You check spelling",
  text: words.join("\n"),
});

const FIX_TEH = '<word text="teh" verdict="fix">the</word>';
const FIX_SEPARATE = '<word text="seperate" verdict="fix">separate</word>';

const draft = (text: string): VscodeStep[] => [
  { type: "hello" },
  { press: "Enter" },
  { wait: "Hello from the stub", timeout: 30_000 },
  { type: text },
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
      steps: draft(TWO),
    },
    clean: {
      about: "a draft with nothing flagged: the quiet line that offers Haiku",
      start: { turns: [reply], plugins: ["spellfix"] },
      steps: draft("Please fix the handler"),
    },
    picker: {
      about: "the picker on `teh`, once `click Review`: hunspell's suggestions and Haiku's",
      start: { turns: [reply, haiku(FIX_TEH)], plugins: ["spellfix"] },
      steps: draft(ONE),
    },
    nomodel: {
      about: "after `click Review`, the picker when Haiku has no suggestion for the word",
      start: {
        turns: [reply, haiku('<word text="teh" verdict="unsure"/>')],
        plugins: ["spellfix"],
      },
      steps: draft(ONE),
    },
    add: {
      about:
        "after `click Review`, the picker with a personal dictionary: Add word joins the actions",
      start: { turns: [reply, haiku(FIX_TEH)], plugins: ["spellfix"], ...personal },
      setup: (ctx) => ctx.write("personal.dic", "1\nkeepme\n"),
      steps: draft(ONE),
    },
    fixed: {
      about: 'after `click Review` and `click "Fix all"`: the report with Undo and Dismiss',
      start: { turns: [reply, haiku(FIX_TEH, FIX_SEPARATE)], plugins: ["spellfix"] },
      steps: draft(TWO),
    },
    long: {
      about: "after `click Review`, a long context line round the word in a narrow pane",
      start: { turns: [reply, haiku(FIX_TEH)], plugins: ["spellfix"] },
      steps: draft(LONG),
    },
  },
});
