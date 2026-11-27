import { assetPath } from "@agents/drive/lib/harness.ts";
import { gridLines, region, type Region } from "@agents/drive/lib/screen.ts";
import { logged, scenarios, type Step } from "@agents/drive/lib/scenario.ts";
import type { Session } from "@agents/drive/lib/session.ts";
import { BRANCH, checkout, dirty, LONG_BRANCH, plain, start, withRemote } from "./fixture.ts";
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
      about: "the pointer on the model brightens it; the keyboard's focus stays in the prompt",
      setup: checkout,
      steps: [...name, { hover: "Replay (fixture)" }, { sleep: 300 }],
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
