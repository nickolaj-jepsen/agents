import type { Turn } from "@agents/drive/lib/harness.ts";
import type { Step } from "@agents/drive/lib/scenario.ts";
import { poster, site, slow } from "@agents/drive/lib/site.ts";

const DRAFT = "Can you teh quick brwon fox jump form the fence and fix the recieve handler";

/**
 * Haiku's one answer for the draft whatever request it comes with: hunspell flags `teh`, `brwon`
 * and `recieve`; `form` for `from` only the model catches.
 */
const turns: Turn[] = [
  // An earlier exchange, so the screen is a conversation and not an empty page.
  {
    text: "The retry logic is in `src/sync.ts`, in `backoff()`: it doubles the delay after each `429` and gives up after five tries.",
  },
  {
    match: "You check spelling",
    text: [
      '<word text="teh" verdict="fix">the</word>',
      '<word text="brwon" verdict="fix">brown</word>',
      '<word text="recieve" verdict="fix">receive</word>',
      '<extra word="form" nth="1">from</extra>',
    ].join("\n"),
  },
];

const start = { hermetic: true, turns };
const EXCHANGE: Step[] = [
  { type: "Where does the sync worker retry?" },
  { press: "Enter" },
  { wait: "gives up after five tries", timeout: 20_000 },
];
/** The picker's keys, drawn once the batch has landed. */
const PICKER = { wait: /fix all \[a\]/ } as const;

export default site({
  plugin: "spellfix",
  demo: {
    caption:
      "Typos in the draft are counted above the prompt. The picker offers hunspell's fix or Haiku's, one word at a time or all at once.",
    project: "app",
    start,
    prepare: EXCHANGE,
    steps: [
      { sleep: 400 },
      slow(DRAFT),
      { sleep: 1800 },
      { press: "Ctrl+q" },
      PICKER,
      { sleep: 3200 },
      poster,
      { press: "1" },
      { sleep: 2600 },
      { press: "a" },
      { sleep: 5000 },
    ],
  },
  stills: {
    counted: {
      caption:
        "A count of the misspelled words sits above the prompt as you type; hunspell finds them.",
      project: "app",
      start,
      steps: [...EXCHANGE, slow(DRAFT, 5, 0), { wait: /\d misspelled/ }],
    },
    picker: {
      caption:
        "The picker shows the word in place with hunspell's suggestions, and Haiku's fix when it has one.",
      project: "app",
      start,
      steps: [
        ...EXCHANGE,
        slow(DRAFT, 5, 0),
        { wait: /\d misspelled/ },
        { press: "Ctrl+q" },
        PICKER,
      ],
    },
  },
  vscode: {
    picker: {
      caption:
        "In VS Code the count sits above the prompt, and Review opens the picker with hunspell's suggestions and Haiku's fix.",
      scenario: "picker",
      // The scenario ends at the typed draft. VS Code raises no prompt event, so the band reads the
      // draft only when it is drawn again, which a change to the prompt box's width brings about.
      steps: [
        { resize: [560, 720] },
        { resize: [1280, 720] },
        { wait: "1 misspelled", timeout: 30_000 },
        { click: "Review" },
        { wait: "Fix all" },
      ],
    },
  },
});
