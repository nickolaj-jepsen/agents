import { fileURLToPath } from "node:url";
import { assetPath } from "@agents/drive/lib/harness.ts";
import {
  findText,
  gridLines,
  region,
  type Pattern,
  type Region,
} from "@agents/drive/lib/screen.ts";
import { logged, scenarios, type Step } from "@agents/drive/lib/scenario.ts";
import type { Session } from "@agents/drive/lib/session.ts";
import { sleep } from "@agents/drive/lib/term.ts";
import {
  BRANCH,
  checkout,
  CONFIG_ENV,
  withConfig,
  detached,
  dirty,
  GIT_ENV,
  LONG_BRANCH,
  merging,
  plain,
  staged,
  start,
  wideBranch,
  withRemote,
} from "./fixture.ts";
import { HUNSPELL } from "./hunspell.ts";

/**
 * The frame from the editor's top border down through the footer: the border with the session's
 * label, the draft and its bottom rule, and the line under it. It ends at the last row that says
 * anything, since what fills the screen above is the transcript.
 */
const frame: Region = (grid) => {
  const lines = gridLines(grid);
  const top = lines.findIndex((line) => line.startsWith("── "));
  if (top < 0) return undefined;
  let bottom = lines.length - 1;
  while (bottom > top && lines[bottom] === "") bottom--;
  return { x: 0, y: top, w: grid[0]?.length ?? 0, h: bottom - top + 1 };
};

/** A sheet or a panel a press opened: it is the surface then, and the frame when none is up. */
const surface = region.any(region.standing, region.sidebar, frame);

/** pi's model picker, which is full width and has no frame of its own: its rows and its detail. */
const picker: Region = (grid) => {
  const lines = gridLines(grid);
  const at = lines.findIndex((line) => line.startsWith("Scope: all"));
  if (at < 0) return undefined;
  let top = at;
  while (top > 0 && !/^─{10,}$/.test(lines[top] ?? "")) top--;
  const to = lines.findIndex((line, i) => i > at && line.startsWith("Model Name:"));
  const bottom = to < 0 ? lines.length - 1 : to;
  return { x: 0, y: top, w: grid[0]?.length ?? 0, h: bottom - top + 1 };
};

/** Names the session: the label on the top border, and the first thing in the title. */
const name: Step[] = [{ type: "/name Release cleanup" }, { press: "Enter" }];

/** A half-written prompt, the thing a control beside it must leave where it found it. */
const DRAFT = "Summarise the retry work";

/** Past pi's 1000-character threshold, so the draft holds a `[paste #1 …]` marker instead of it. */
const PASTED = Array.from(
  { length: 40 },
  (_, i) => `line ${i + 1}: the worker honours Retry-After and doubles the delay.`,
).join("\n");

/** One fix for the review's side call, as spellfix's own scenarios answer it. */
const FIX = { text: '<word text="teh" verdict="fix">the</word>' };

/** A draft with one word the stand-in hunspell rejects, so spellfix underlines it. */
const TYPO = "Please fix teh handler before the release";

/**
 * Throws unless a word of the draft is underlined on screen: a text read cannot see a style, and
 * the underlines are the whole of what the bridge draws.
 */
const underlined: Step = {
  run: async (s: Session) => {
    const deadline = Date.now() + 8000;
    for (;;) {
      const grid = await s.term.grid();
      const drawn = grid.some((row) => row.some((cell) => cell.underline_style !== "none"));
      if (drawn) return;
      if (Date.now() > deadline)
        throw new Error(`nothing is underlined; screen:\n${gridLines(grid).join("\n")}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  },
};

/**
 * The stand-ins this package's scenarios load beside the frame: another extension's footer
 * statuses, and a tool that asks the person a question while it runs.
 */
const STAND_IN = fileURLToPath(new URL("./stand-in.ts", import.meta.url));

/** The frame, with the stand-ins loaded after it. */
const withStandIn = (before: boolean) => ({
  ...start,
  plugins: before ? ["chrome"] : ["chrome"],
  args: ["-e", STAND_IN],
});

/**
 * The context share pi estimates is a property of the prompt, so it moves between machines: the
 * snapshot keeps its cells and loses its digits, as the built-in context meter's is.
 */
const contextMask = [
  { pattern: /\d+(?:\.\d+)?%(?= \/ \d+k)/g },
  { pattern: /(?<=ctx )\d+(?:\.\d+)?%/g },
];

/**
 * Throws unless the pointer lights `what` while it rests on it. The frame lets a hover lapse, since
 * pi sends nothing when the pointer rests or leaves, so a photographed screen shows the state after
 * it; the light itself is read from the cells under the pointer.
 */
const litByHover = (what: Pattern, text: string): Step => ({
  run: async (s: Session) => {
    const at = findText(await s.term.grid(), what)[0];
    if (!at) throw new Error(`${text} is not on screen to point at`);
    const before = (await s.term.grid())[at.y]?.[at.x]?.fg;
    await s.term.move(at.x, at.y);
    await sleep(150);
    const after = (await s.term.grid())[at.y]?.[at.x]?.fg;
    if (after === before)
      throw new Error(`the pointer on ${text} changed nothing; it is still ${String(before)}`);
  },
});

/**
 * The apps a press may start, stubbed so a scenario never opens a real editor or browser: each
 * writes its own name and arguments to `launched.log` beside the run's `bin`.
 */
const app = (name: string) =>
  `#!/bin/sh\necho "${name} $*" >> "$(dirname "$0")/../launched.log"\nexit 0\n`;

const machine = {
  bin: Object.fromEntries(
    ["code", "xdg-open", "nautilus", "smerge", "zed", "zeditor"].map((n) => [n, app(n)]),
  ),
  hide: ["smerge", "zed", "zeditor"],
};

/** `gh pr view`: the branch has no pull request, answered without a network or an account. */
const GH_NONE = '#!/bin/sh\necho "no pull requests found for branch" >&2\nexit 1\n';

/**
 * A frame with the plugins a person installs beside it. `spellfix`'s dictionary is the stand-in's,
 * so which words are underlined is the same on a machine with hunspell and on CI; its personal
 * dictionary is the run's, so a developer's learned words change nothing.
 */
const withSpellfix = (before: boolean) => ({
  ...start,
  plugins: before ? ["spellfix", "chrome"] : ["chrome", "spellfix"],
  bin: { hunspell: HUNSPELL },
  env: {
    PI_SPELLFIX_HUNSPELL: "hunspell",
    PI_SPELLFIX_DICTS: "en_US",
    PI_SPELLFIX_PERSONAL: "",
    PI_SPELLFIX_MODEL: "fixture/replay",
  },
});

/**
 * The frame with the three companions a person installs with it: open, notes and spellfix. The
 * driver's `invoke-action` stands beside them to count the plugins that registered each action,
 * which is how a second `/open` would show.
 */
const companions = {
  ...start,
  plugins: ["chrome", "open", "notes", "spellfix"],
  args: ["-e", assetPath("invoke-action.ts")],
  bin: { ...machine.bin, gh: GH_NONE, hunspell: HUNSPELL },
  hide: machine.hide,
  env: {
    INVOKED_ACTION: "open",
    INVOKED_LOG: "{run}/invoked.log",
    PI_SPELLFIX_HUNSPELL: "hunspell",
    PI_SPELLFIX_DICTS: "en_US",
    PI_SPELLFIX_PERSONAL: "",
    PI_SPELLFIX_MODEL: "fixture/replay",
    // notes' store lives in the run's own folder, never in the person's.
    XDG_DATA_HOME: "{run}/data",
  },
};

export default scenarios({
  plugin: "chrome",
  harness: "pi",
  // Hermetic: its own config with this plugin alone, so nothing of the person's setup shows.
  start: { ...start, plugins: ["chrome"] },
  region: frame,
  mask: contextMask,
  scenarios: {
    frame: {
      about:
        "the frame around an empty prompt: the session's name on the top border, and the model, the checkout and its branch under it",
      setup: checkout,
      steps: [...name, { wait: "Release cleanup" }, { wait: BRANCH }],
      extreme: true,
    },
    draft: {
      about:
        "a half-written prompt with a pasted block: the frame keeps both, and the border its label",
      setup: checkout,
      steps: [...name, { type: DRAFT }, { paste: PASTED }, { wait: /\[paste #1 \+\d+ lines\]/ }],
    },
    model: {
      about:
        "a click on the model opens pi's own picker over the frame; the draft under it is whole",
      setup: checkout,
      region: picker,
      steps: [...name, { type: DRAFT }, { click: "Replay (fixture)" }, { wait: "Model Name:" }],
    },
    "model-closed": {
      about: "Escape closes the picker and the draft is where it was, ready for more",
      from: "model",
      region: frame,
      steps: [
        { press: "Escape" },
        { wait: "Summarise the retry work" },
        { type: " for the release" },
        { wait: `${DRAFT} for the release` },
      ],
    },
    "model-hover": {
      about:
        "the pointer on the model, and on a chip, brightens them; the keyboard stays in the prompt, and the frame lets a resting hover go",
      setup: checkout,
      steps: [
        ...name,
        litByHover("Replay (fixture)", "the model"),
        litByHover("\uf489", "the tools chip"),
        { sleep: 300 },
      ],
    },
    "plain-folder": {
      about: "a folder that is no repository: the footer keeps its words and draws no branch",
      setup: plain,
      steps: [...name, { wait: "Replay (fixture)" }, { sleep: 700 }],
    },
    dirty: {
      about: "a checkout with a modified and an untracked file: the branch carries its marks",
      setup: dirty,
      steps: [...name, { wait: /feature\/frame-extract\*/ }, { wait: "?" }],
    },
    "narrow-branch": {
      about:
        "a branch name too long for 70 columns: the name goes before the checkout's path and the model",
      setup: (ctx) => checkout(ctx, LONG_BRANCH),
      size: [70, 24],
      sizes: [[70, 24]],
      steps: [...name, { wait: "Replay (fixture)" }, { sleep: 700 }],
    },
    "no-owner": {
      about:
        "a click on the branch with no /git plugin installed: the transcript says so and the frame stays",
      setup: checkout,
      region: region.full,
      size: [70, 24],
      sizes: [[70, 24]],
      steps: [
        ...name,
        { type: DRAFT },
        { click: BRANCH },
        { wait: "chrome: no /git plugin is installed" },
      ],
    },
    "invoked-open": {
      about:
        "a click on the checkout invokes /open: open's own sheet over the draft, and one plugin owning each action",
      setup: withRemote,
      start: companions,
      region: surface,
      // A sheet closes when the session is resized under it: drawn at its own size, no resize.
      sizes: [[160, 45]],
      steps: [
        ...name,
        { type: DRAFT },
        { click: "cwd" },
        { wait: "Open folder" },
        { sleep: 700 },
        logged("invoked.log", () => "open=1 git=1 notes=1"),
      ],
    },
    "invoked-open-closed": {
      about:
        "Escape closes the invoked sheet and the draft it opened over is whole, ready for more",
      from: "invoked-open",
      region: frame,
      sizes: [[160, 45]],
      steps: [
        { press: "Escape" },
        { wait: "Open Folder", gone: true },
        { wait: "Open folder", gone: true },
        { type: " for the release" },
        { wait: `${DRAFT} for the release` },
      ],
    },
    "invoked-git": {
      about: "a click on the branch invokes /git: the same sheet the command opens, over the draft",
      setup: withRemote,
      start: companions,
      region: surface,
      sizes: [[160, 45]],
      steps: [
        ...name,
        { type: DRAFT },
        { click: BRANCH },
        { wait: "Open repository" },
        { wait: "Create pull request" },
        logged("invoked.log", () => "open=1 git=1 notes=1"),
      ],
    },
    "invoked-empty": {
      about:
        "the checkout and the branch pressed with nothing in the prompt: each opens the sheet its owner draws, and closing one leaves the frame",
      setup: withRemote,
      start: companions,
      region: surface,
      sizes: [[160, 45]],
      steps: [
        ...name,
        { click: "cwd" },
        { wait: "Open folder" },
        { press: "Escape" },
        { wait: "Open folder", gone: true },
        { click: BRANCH },
        { wait: "Open repository" },
        { sleep: 500 },
      ],
    },
    notes: {
      about: "the notes plugin's own panel over the frame, with no second command registered here",
      setup: withRemote,
      start: companions,
      region: surface,
      sizes: [[160, 45]],
      steps: [
        ...name,
        { type: "/notes" },
        { press: "Enter" },
        { wait: /Notes/ },
        { sleep: 700 },
        logged("invoked.log", () => "open=1 git=1 notes=1"),
      ],
    },
    failed: {
      about: "a turn that ended on an error: the border says failed beside the label",
      setup: checkout,
      start: { ...start, turns: [{ error: "upstream refused the request" }] },
      steps: [
        ...name,
        { type: "Summarise the retry work" },
        { press: "Enter" },
        { wait: /failed/ },
      ],
    },
    cursor: {
      about:
        "the cursor is where it was after a control invoked /open over the draft: the next word lands there",
      setup: withRemote,
      start: companions,
      sizes: [[160, 45]],
      steps: [
        ...name,
        { type: DRAFT },
        { press: ["Home", ...Array<string>(10).fill("Right")] },
        { click: "cwd" },
        { wait: "Open folder" },
        { press: "Escape" },
        { wait: "Open folder", gone: true },
        { type: "ZZ " },
        { wait: "Summarise ZZ the retry work" },
      ],
    },
    replace: {
      about:
        "spellfix's review writes a fix back through the frame's editor, and the pasted block keeps its marker",
      setup: checkout,
      start: { ...withSpellfix(false), turns: [FIX] },
      steps: [
        ...name,
        { type: TYPO },
        { paste: PASTED },
        { wait: /\[paste #1 \+\d+ lines\]/ },
        { press: "Ctrl+q" },
        { wait: /spellfix · \d+ to apply · 1 found/ },
        { press: "Enter" },
        { wait: /Please fix the handler before the release\[paste #1 \+\d+ lines\]/ },
      ],
    },
    underlines: {
      about:
        "spellfix underlines a misspelling in the draft through the frame's editor, loaded after it",
      setup: checkout,
      start: withSpellfix(false),
      steps: [...name, { type: TYPO }, { wait: TYPO }, underlined],
    },
    "underlines-first": {
      about:
        "the same underlines with spellfix loaded before the frame, so load order alone decides nothing",
      setup: checkout,
      start: withSpellfix(true),
      steps: [...name, { type: TYPO }, { wait: TYPO }, underlined],
    },
    metrics: {
      about:
        "a finished turn's readings on the border: the share of the window it used, and what the session was priced at",
      setup: checkout,
      start: {
        ...start,
        turns: [
          {
            text: "The frame is drawn by the chrome plugin.",
            usage: { input: 12000, output: 250, cost: 0.4213 },
          },
        ],
      },
      steps: [
        ...name,
        { type: "Summarise the retry work" },
        { press: "Enter" },
        { wait: "The frame is drawn by the chrome plugin." },
        // The readings themselves, which the snapshot keeps only as cells: pi's estimate moves with
        // the prompt, and the driver masks a cost to the width it took.
        { wait: /\d+% \/ 200k/ },
        { wait: "$0.42" },
        { sleep: 500 },
      ],
      extreme: true,
    },
    "metrics-covered": {
      about:
        "a dialog over the editor takes the border with it, so the footer carries the context and the cost itself",
      from: "metrics",
      region: picker,
      sizes: [[160, 45]],
      steps: [
        { press: "Ctrl+l" },
        { wait: "Model Name:" },
        { wait: /ctx \d+%/ },
        { wait: "$0.42" },
        { sleep: 500 },
      ],
    },
    cache: {
      about:
        "a provider's cache that stopped holding: the footer says so in the alarm colour, beside a session that has cost something",
      setup: checkout,
      start: {
        ...start,
        turns: [
          { text: "First reply.", usage: { input: 0, cacheRead: 3000, cost: 0.01 } },
          { text: "Second reply.", usage: { input: 3000, cacheRead: 0, cost: 0.02 } },
        ],
      },
      steps: [
        ...name,
        { type: "One" },
        { press: "Enter" },
        { wait: "First reply." },
        { type: "Two" },
        { press: "Enter" },
        { wait: "Second reply." },
        { sleep: 500 },
      ],
    },
    status: {
      about:
        "another extension's footer statuses, one carrying a colour and a newline: drawn as plain words, and the first to go when the row is narrow",
      setup: checkout,
      start: withStandIn(false),
      steps: [...name, { wait: "build one two 一斉" }, { wait: "lint ok" }, { sleep: 300 }],
      extreme: false,
    },
    chips: {
      about:
        "a click on each condense chip: the reasoning stops showing when the thinking chip is pressed, and the chip itself goes quiet",
      setup: checkout,
      start: {
        ...start,
        turns: [
          {
            thinking: "Weighing the branch name.",
            text: "The frame is drawn by the chrome plugin.",
          },
        ],
      },
      steps: [
        ...name,
        { type: "Summarise the retry work" },
        { press: "Enter" },
        { wait: "Weighing the branch name." },
        { click: "\uf489" },
        { sleep: 300 },
        { click: "\uf0eb" },
        { wait: "Weighing the branch name.", gone: true },
        { sleep: 300 },
      ],
    },
    "chips-keys": {
      about:
        "the same two states reached with ctrl+o and ctrl+t, the keys pi already binds them to",
      setup: checkout,
      start: {
        ...start,
        turns: [
          {
            thinking: "Weighing the branch name.",
            text: "The frame is drawn by the chrome plugin.",
          },
        ],
      },
      steps: [
        ...name,
        { type: "Summarise the retry work" },
        { press: "Enter" },
        { wait: "Weighing the branch name." },
        { press: "Ctrl+o" },
        { press: "Ctrl+t" },
        { wait: "Weighing the branch name.", gone: true },
        { sleep: 300 },
      ],
    },
    "chips-draft": {
      about:
        "the same chips pressed under a half-written prompt: the draft is where it was, ready for the next word",
      setup: checkout,
      mask: [{ pattern: /\d+(?:\.\d+)?%(?= \/ \d+k)/g }],
      steps: [
        ...name,
        { type: DRAFT },
        { click: "\uf489" },
        { sleep: 300 },
        { click: "\uf0eb" },
        { sleep: 300 },
        { type: " for the release" },
        { wait: `${DRAFT} for the release` },
      ],
    },
    "tree-draft": {
      about:
        "the context reading opens the session tree over a draft, and closing it leaves the draft whole",
      setup: checkout,
      region: region.full,
      start: {
        ...start,
        turns: [
          { text: "The frame is drawn by the chrome plugin.", usage: { input: 12000, cost: 0.42 } },
        ],
      },
      sizes: [[160, 45]],
      steps: [
        ...name,
        { type: DRAFT },
        { press: "Enter" },
        { wait: "The frame is drawn by the chrome plugin." },
        { type: DRAFT },
        { click: /\d+% \/ 200k/ },
        { wait: /Session Tree/i },
        { sleep: 300 },
      ],
    },
    tree: {
      about:
        "a click on the context reading opens pi's session tree, which is where a full window is navigated",
      setup: checkout,
      region: region.full,
      start: {
        ...start,
        turns: [
          {
            text: "The frame is drawn by the chrome plugin.",
            usage: { input: 12000, output: 250, cost: 0.4213 },
          },
        ],
      },
      sizes: [[160, 45]],
      steps: [
        ...name,
        { type: "Summarise the retry work" },
        { press: "Enter" },
        { wait: "The frame is drawn by the chrome plugin." },
        { click: /\d+% \/ 200k/ },
        { wait: /Session tree|tree/i },
      ],
    },
    waiting: {
      about:
        "a tool that asks the person a question: the border says waiting while the run is blocked on the dialog",
      setup: checkout,
      start: {
        ...withStandIn(false),
        turns: [
          { toolCall: { name: "ask_user", arguments: { question: "Send the release?" } } },
          { text: "The release is sent." },
        ],
      },
      sizes: [[160, 45]],
      steps: [
        ...name,
        { type: "Ship it" },
        { press: "Enter" },
        { wait: "Send the release?" },
        { wait: "waiting" },
        { sleep: 300 },
      ],
    },
    detached: {
      about:
        "a detached HEAD: the commit stands in for the branch, with the glyph that says there is none",
      setup: detached,
      // The fixture's commit is made when the run starts, so its hash is the run's, not the screen's.
      mask: [{ pattern: /\uf417 [0-9a-f]{7}/g, with: "\uf417 <sha>" }],
      steps: [...name, { wait: "Replay (fixture)" }, { sleep: 700 }],
    },
    merging: {
      about:
        "a merge stopped on a conflict: the branch, its conflict count and the operation it is in the middle of",
      setup: merging,
      steps: [...name, { wait: /feature\/frame-extract/ }, { wait: /merge/ }, { sleep: 700 }],
    },
    staged: {
      about:
        "a staged change: the branch's mark is the warning colour, quieter than an unstaged one",
      setup: staged,
      steps: [...name, { wait: /feature\/frame-extract\*/ }, { sleep: 700 }],
    },
    "wide-branch": {
      about:
        "a branch whose name is wide characters: the row measures cells, so the name cannot push the line past its width",
      setup: wideBranch,
      steps: [...name, { wait: "Replay (fixture)" }, { sleep: 700 }],
      sizes: [
        [70, 24],
        [160, 45],
      ],
    },
    "model-change": {
      about:
        "pi's model cycle: the footer names the model that is answering now, and its effort with it",
      setup: checkout,
      start: {
        ...start,
        args: ["--models", "fixture/replay,fixture/replay-two"],
        env: {
          FIXTURE_MODELS: JSON.stringify([
            { id: "replay-two", name: "Replay the second", reasoning: true },
          ]),
          FIXTURE_MODEL: JSON.stringify({ reasoning: true }),
        },
      },
      sizes: [[160, 45]],
      steps: [
        ...name,
        { wait: "Replay (fixture)" },
        { press: "Ctrl+p" },
        { wait: "Replay the second" },
        // The effort chip is pi's thinking cycle: pressing it moves the level it names, and pi
        // says so in the transcript, which is what a person reads back.
        { click: "\uf0e7 medium" },
        { wait: "Thinking level: high" },
        { sleep: 300 },
      ],
    },
    "checkout-change": {
      about:
        "a tool call that moves the checkout to another branch: the footer follows it as soon as the command returns",
      setup: checkout,
      start: {
        ...start,
        turns: [
          {
            text: "The frame is drawn by the chrome plugin.",
            toolCall: { name: "bash", arguments: { command: "git checkout -q -b feature/later" } },
          },
          { text: "The branch is feature/later." },
        ],
        env: GIT_ENV,
      },
      sizes: [[160, 45]],
      steps: [
        ...name,
        { wait: BRANCH },
        { type: "Move the branch" },
        { press: "Enter" },
        { wait: "The branch is feature/later." },
        { wait: "feature/later" },
        { sleep: 300 },
      ],
    },
    "typed-git": {
      about:
        "a `!command` typed into the prompt that moves the branch: the footer is refreshed when it returns",
      setup: checkout,
      start: { ...start, env: GIT_ENV },
      sizes: [[160, 45]],
      steps: [
        ...name,
        { wait: BRANCH },
        { type: "!git checkout -q -b feature/typed" },
        { press: "Enter" },
        { wait: "feature/typed" },
      ],
    },
    "herdr-absent": {
      about:
        "no Herdr, and nothing from it: the frame is drawn anyway, since no part of it needs one",
      setup: checkout,
      start: { ...start, hide: ["hc"] },
      sizes: [
        [70, 24],
        [160, 45],
      ],
      steps: [...name, { wait: BRANCH }, { sleep: 300 }],
    },
    "herdr-failing": {
      about:
        "a Herdr terminal whose `hc` client answers with an error: the frame still starts and draws, and nothing waits on it",
      setup: checkout,
      start: {
        ...start,
        env: { HC_TERMINAL_ID: "e2e-terminal" },
        bin: { hc: '#!/bin/sh\necho "core unavailable" >&2\nexit 1\n' },
      },
      sizes: [
        [70, 24],
        [160, 45],
      ],
      steps: [...name, { wait: BRANCH }, { sleep: 300 }],
    },
    "herdr-enabled": {
      about:
        "the same frame inside a Herdr terminal whose client answers: the terminal's marker changes nothing",
      setup: checkout,
      start: {
        ...start,
        env: { HC_TERMINAL_ID: "e2e-terminal" },
        bin: { hc: '#!/bin/sh\necho "hc 1.0.0"\n' },
      },
      sizes: [
        [70, 24],
        [160, 45],
      ],
      steps: [...name, { wait: BRANCH }, { sleep: 300 }],
    },
    configured: {
      about:
        "a host's own configuration file: the watched provider's model in the alarm colour, the provider accented, the path as text, and the model's short name when the row is narrow",
      setup: withConfig(
        JSON.stringify({
          roles: { provider: "accent", model: "dim", effort: "warning", path: "dim" },
          watched: ["fixture"],
          routed: ["fixture/replay"],
          names: { replay: "RPL" },
        }),
      ),
      start: {
        ...start,
        // A model name long enough that 70 columns has to shorten it to the configured one.
        env: {
          ...CONFIG_ENV,
          FIXTURE_MODEL: JSON.stringify({ name: "Replay (fixture), long name" }),
        },
      },
      steps: [...name, { wait: "Replay (fixture), long name" }, { sleep: 500 }],
    },
    "configured-invalid": {
      about:
        "a configuration file that does not parse: the frame says what it refused and draws with the neutral values",
      setup: withConfig(JSON.stringify({ roles: { effort: "bright" }, colour: "red" })),
      start: { ...start, env: CONFIG_ENV },
      region: region.full,
      sizes: [[160, 45]],
      steps: [
        ...name,
        { wait: /chrome: .*roles\.effort: expected one of/ },
        { wait: /chrome: .*colour: unknown setting, ignored/ },
        { sleep: 300 },
      ],
    },
    speed: {
      about:
        "a reply that took long enough to measure, shown while the next one streams: the speed belongs to the reply that finished, so it says nothing once the session is idle",
      setup: checkout,
      start: {
        ...start,
        turns: [
          {
            text: "The frame is drawn by the chrome plugin.",
            usage: { input: 4000, output: 250, cost: 0.02 },
            delayMs: 1200,
          },
          { text: "The second reply.", delayMs: 1500 },
        ],
      },
      steps: [
        ...name,
        { type: "Summarise the retry work" },
        { press: "Enter" },
        { wait: "The frame is drawn by the chrome plugin." },
        { type: "And the next one" },
        { press: "Enter" },
        { wait: /\d+ t\/s/ },
        // The screen photographed is the settled one: the meter is only there while a reply runs.
        { wait: "The second reply." },
        { sleep: 2500 },
      ],
      sizes: [[160, 45]],
    },
    reload: {
      about:
        "after /reload the new editor is the one spellfix decorates: a fresh typo is underlined again",
      setup: checkout,
      start: withSpellfix(false),
      steps: [
        ...name,
        { type: TYPO },
        { press: "Enter" },
        { wait: "The frame is drawn by the chrome plugin." },
        { type: "/reload" },
        { press: "Enter" },
        { wait: "Release cleanup" },
        { wait: "Replay (fixture)" },
        { type: "Then seperate the orders" },
        { wait: "Then seperate the orders" },
        underlined,
      ],
    },
  },
});
