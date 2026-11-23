import type { Turn } from "@agents/drive/lib/harness.ts";
import { gridLines, type Region } from "@agents/drive/lib/screen.ts";
import { scenarios, type Step } from "@agents/drive/lib/scenario.ts";

/**
 * The sheet and the prompt it stands on: from its title rule down through the draft's own rule,
 * so a snapshot proves the draft it reviews is in sight rather than covered. The sheet has no
 * bottom edge, so the rule over the prompt is where it ends and the draft begins.
 */
const onPrompt: Region = (grid) => {
  const lines = gridLines(grid);
  const top = lines.findIndex((l) => /^\s*╭─ spellfix/.test(l));
  if (top < 0) return undefined;
  const rules = lines.map((l, y) => (/^─{10,}$/.test(l) ? y : -1)).filter((y) => y > top);
  // The rule over the prompt, then the one under the draft.
  const bottom = rules[1] ?? rules[0];
  if (bottom === undefined) return undefined;
  return { x: 0, y: top, w: grid[0]?.length ?? 0, h: bottom - top + 1 };
};

/** A draft with one typo: hunspell flags it, and the fixture model answers it. */
const ONE = "Please fix teh handler before it breaks";
/** A draft with many: more findings than a short terminal shows, and a long context line. */
const MANY =
  "Before the release we need to go through every handler in the worker and check that each one " +
  "still retries after a 429, and in particular that teh delay doubles each time and gives up " +
  "after five tries, because the old code silently dropped the job, and seperate the orders, and " +
  "recieve the patch, and occured yesterday, and wierd output, and goverment rules, and tommorow " +
  "morning";

/** One line per word, as the review's prompt asks the model for. */
const answer = (...lines: string[]): Turn => ({ text: lines.join("\n") });
const fix = (word: string, to: string) => `<word text="${word}" verdict="fix">${to}</word>`;

const FIXES = [
  fix("teh", "the"),
  fix("seperate", "separate"),
  fix("recieve", "receive"),
  fix("occured", "occurred"),
  fix("wierd", "weird"),
  fix("goverment", "government"),
  fix("tommorow", "tomorrow"),
];

/**
 * The fixture provider answers the review's side call, which is the first model request in a
 * hermetic session: its replay turns are consumed in order, so the reply is first.
 */
const start = {
  hermetic: true,
  plugins: ["spellfix"],
  env: {
    // The side call's own model, pointed at the replay provider so no real call is made.
    PI_SPELLFIX_MODEL: "fixture/replay",
    PI_SPELLFIX_DICTS: "en_US",
    // The session's own hunspell and no personal dictionary: a developer's words must not change
    // what the review finds, or a machine that learned `recieve` would draw one finding fewer.
    PI_SPELLFIX_HUNSPELL: "hunspell",
    PI_SPELLFIX_PERSONAL: "",
  },
};

/** Type the draft, open the review, and wait until its findings are drawn. */
const open = (text: string): Step[] => [
  { type: text },
  { press: "Ctrl+q" },
  { wait: /spellfix · \d+ to apply · [1-9]\d* found/ },
];

export default scenarios({
  plugin: "spellfix",
  harness: "pi",
  start: { ...start, turns: [answer(fix("teh", "the"))] },
  // The sheet stands on the rule over the prompt, so a snapshot shows the draft below it, whole:
  // that is what its `foot: "none"` is for.
  region: onPrompt,
  scenarios: {
    review: {
      about: "the review with one typo: the word as written, its fix in green, and the keys",
      steps: open(ONE),
    },
    extreme: {
      about:
        "seven findings in a long draft, the first focused: whole rows, the kit's window marker and the button row at each size",
      start: { turns: [answer(...FIXES)] },
      // The cursor ends the draft, so the review opens on the last finding; Home puts it on the first.
      steps: [...open(MANY), { press: "Home" }, { press: "Home" }, { wait: "1/7" }],
      extreme: true,
    },
    paged: {
      about:
        "Home then End: the window follows from the first finding to the last, which says how many are above",
      start: { turns: [answer(...FIXES)] },
      size: [70, 24],
      sizes: [[70, 24]],
      steps: [...open(MANY), { press: "End" }, { wait: "7/7" }],
    },
    nomodel: {
      about:
        "the review when the side model is not in the catalog: every finding waits, and the notice says why",
      start: { turns: [{ text: "unused" }], env: { PI_SPELLFIX_MODEL: "nope/nope" } },
      steps: [...open(ONE), { wait: "model: no answer" }],
    },
    click: {
      about: "a click on the second finding's word focuses it; the pointer moves there",
      start: { turns: [answer(...FIXES)] },
      size: [160, 45],
      sizes: [[160, 45]],
      steps: [...open(MANY), { hover: "seperate" }, { click: "seperate" }, { wait: "2/7" }],
    },
    close: {
      about: "a click on Close in the top rule closes the review and leaves the draft as it was",
      from: "review",
      // The review is gone: the prompt holds the draft, above its rule. Found by hand: the file's
      // region needs the sheet, which this state no longer has.
      region: (grid) => {
        const lines = gridLines(grid);
        const at = lines.findIndex((l) => l === ONE);
        const rule = lines.findIndex((l, y) => y > at && /^─{10,}$/.test(l));
        return at < 0 || rule < 0 ? undefined : { x: 0, y: at, w: grid[0]?.length ?? 0, h: 2 };
      },
      steps: [{ click: "Close ×" }, { wait: /spellfix ·/, gone: true }, { wait: ONE }],
    },
  },
});
