import type { Turn } from "@agents/drive/lib/harness.ts";
import { gridLines, type Region } from "@agents/drive/lib/screen.ts";
import { scenarios, type Step } from "@agents/drive/lib/scenario.ts";

const ONE = "Please fix teh handler before it breaks";
const TWO = "Please fix teh handler, it should seperate the orders";
const LONG =
  "Before the release we need to go through every handler in the sync worker and check that each " +
  "one still retries after a 429, and in particular that teh backoff doubles the delay each time " +
  "and gives up after five tries, because the old behaviour silently dropped the job";

/** One stubbed reply, so the session starts. */
const reply: Turn = { text: "Hello from the stub." };
/** Haiku's answer to the batch call, whichever request it comes with. */
const haiku = (...words: string[]): Turn => ({
  match: "You check spelling",
  text: words.join("\n"),
});

const FIX_TEH = '<word text="teh" verdict="fix">the</word>';
const FIX_SEPARATE = '<word text="seperate" verdict="fix">separate</word>';

/** The mod's options through `--settings`: a personal dictionary in the run's folder. */
const personal = {
  args: [
    "--settings",
    JSON.stringify({
      pluginConfigs: {
        spellfix: { options: { personalDictionary: "personal.dic" } },
        "spellfix@inline": { options: { personalDictionary: "personal.dic" } },
      },
    }),
  ],
};

const greet: Step[] = [
  { type: "hello" },
  { press: "Enter" },
  { wait: "Hello from the stub", timeout: 30_000 },
];
const draft = (text: string): Step[] => [...greet, { type: text }, { wait: /\d misspelled/ }];
const open: Step[] = [{ press: "Ctrl+q" }, { wait: /fix all/ }];

/** Everything under the turn's "done" line: the band, the prompt and the footer. The line's verb is random. */
const belowTurn: Region = (grid) => {
  const done = gridLines(grid).findIndex((row) => row.includes(" · done "));
  const y = done < 0 ? 0 : done + 1;
  return { x: 0, y, w: grid[0]?.length ?? 0, h: Math.max(1, grid.length - y) };
};

export default scenarios({
  plugin: "spellfix",
  harness: "claude",
  start: { hermetic: true, plugins: ["spellfix"], turns: [reply] },
  region: belowTurn,
  scenarios: {
    band: {
      about: "two words flagged in the draft: the count above the prompt",
      steps: draft(TWO),
    },
    picker: {
      about: "ctrl+q on `teh`: hunspell's suggestions and Haiku's fix, the keys beside them",
      start: { turns: [reply, haiku(FIX_TEH)] },
      steps: [...draft(ONE), ...open],
      extreme: true,
    },
    nomodel: {
      about: "the picker when Haiku has no suggestion for the word",
      start: { turns: [reply, haiku('<word text="teh" verdict="unsure"/>')] },
      steps: [...draft(ONE), ...open],
    },
    add: {
      about: "the picker with a personal dictionary: add to the dictionary joins the keys",
      start: { turns: [reply, haiku(FIX_TEH)], ...personal },
      setup: (ctx) => ctx.write("personal.dic", "1\nkeepme\n"),
      steps: [...draft(ONE), ...open],
    },
    long: {
      about: "a long context line round the word",
      start: { turns: [reply, haiku(FIX_TEH)] },
      steps: [...draft(LONG), ...open],
    },
    fixed: {
      about: "after `a`: the fix-all report with undo and dismiss",
      start: { turns: [reply, haiku(FIX_TEH, FIX_SEPARATE)] },
      steps: [...draft(TWO), ...open, { press: "a" }, { wait: /Fixed teh/ }],
    },
  },
});
