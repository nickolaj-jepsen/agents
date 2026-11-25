import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { region } from "@agents/drive/lib/screen.ts";
import { scenarios, type Step } from "@agents/drive/lib/scenario.ts";
import type { Session } from "@agents/drive/lib/session.ts";
import {
  BRANCH,
  BROKEN,
  checkout,
  clipboard,
  LONG_BASE,
  start,
  withBrokenApp,
  withBrokenConfig,
  withConfig,
  withCrowd,
} from "./fixture.ts";

const git: Step[] = [{ type: "/git" }, { press: "Enter" }];
const folder: Step[] = [{ type: "/open" }, { press: "Enter" }];
/** A press within 600 ms of the rows coming is not taken: the menu waits for it to be meant. */
const settled: Step = { sleep: 700 };

/**
 * pi's machine: the stand-ins a press may start and a clipboard that writes `copied.log`, with
 * `bin`'s added and `hide`'s gone, stand-in and the person's own alike.
 */
const machine = (gh: "pr" | "none", bin: Record<string, string> = {}, hide: string[] = []) => {
  const base = start(gh);
  const all = { ...base.bin, ...clipboard.bin, ...bin };
  return {
    ...base,
    bin: Object.fromEntries(Object.entries(all).filter(([name]) => !hide.includes(name))),
    hide: [...base.hide, ...hide],
    env: clipboard.env,
  };
};

/** Waits for a file of the run to hold `line` (`s` gives the session's paths), else fails with what it holds. */
const logged = (file: string, line: (s: Session) => string): Step => ({
  run: async (s) => {
    const path = join(s.runDir, file);
    const want = line(s);
    const deadline = Date.now() + 5000;
    for (;;) {
      const text = existsSync(path) ? readFileSync(path, "utf8") : "";
      if (text.split("\n").includes(want)) return;
      if (Date.now() > deadline)
        throw new Error(`${file} has no line "${want}"; it holds:\n${text}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  },
});

/** The folder pi runs in, as the app is handed it. */
const cwd = (s: Session) => realpathSync(s.cwd);

/** The driver has no wheel call: an SGR mouse report, button 65 down and 64 up, at a cell. */
const wheel = (down: boolean, x: number, y: number, times = 1): Step => ({
  run: async (s) => {
    for (let i = 0; i < times; i++) {
      await s.term.write(`\x1b[<${down ? 65 : 64};${x};${y}M`);
      await new Promise((r) => setTimeout(r, 150));
    }
  },
});

/** The menu is gone, the prompt in front again. */
const closed = (title: string): Step => ({ wait: new RegExp(`╭─ ${title}`), gone: true });

export default scenarios({
  plugin: "open",
  harness: "pi",
  // Hermetic: its own config with this plugin alone, so nothing of the person's setup shows.
  start: { hermetic: true, plugins: ["open"] },
  // The sheet stands on the rule over the prompt: its top edge, its sides and that rule. Where
  // pi's prompt could not be found it keeps a bottom edge of its own.
  region: region.any(region.standing, region.box(/Git|Open folder/)),
  scenarios: {
    git: {
      about: "/git on a pushed branch that has an open pull request: the keyboard on it",
      setup: checkout,
      start: machine("pr"),
      steps: [...git, { wait: "Open pull request" }],
      extreme: true,
    },
    "git-new": {
      about: "/git on a pushed branch with no pull request yet: create is offered into main",
      setup: checkout,
      start: machine("none"),
      steps: [...git, { wait: "into main" }],
    },
    "git-long": {
      about: "/git where the pull request would go into a very long branch name",
      setup: (ctx) => checkout(ctx, BRANCH, LONG_BASE),
      start: machine("none"),
      steps: [...git, { wait: "Create pull request" }],
    },
    folder: {
      about: "/open: Code, the file manager and a terminal installed; Sublime Merge and Zed not",
      setup: checkout,
      start: machine("pr"),
      steps: [...folder, { wait: "Copy path" }],
    },
    "folder-config": {
      about: "/open with an open.json: Neovim in a terminal first, the file manager hidden",
      setup: withConfig,
      start: machine("pr"),
      steps: [...folder, { wait: "Neovim" }],
    },
    "folder-crowd": {
      about:
        "/open with more configured apps than the sheet holds, long and wide labels, some missing",
      setup: withCrowd,
      start: machine("pr"),
      steps: [...folder, { wait: "Neovim in the terminal" }],
      extreme: true,
    },
    "folder-crowd-wheel": {
      about: "the wheel over a long list moves its window, not the keyboard",
      from: "folder-crowd",
      // A window depends on the size it was drawn at, so this starts at the size it is shown at.
      fresh: true,
      size: [70, 24],
      sizes: [[70, 24]],
      steps: [wheel(true, 35, 10), { wait: /↑ \d+ more/ }],
    },
    "git-hover": {
      about: "the pointer on Open branch: its label is bold, the keyboard's pointer stays",
      from: "git",
      sizes: [[70, 24]],
      steps: [{ hover: "Open branch" }, { sleep: 300 }],
    },
    "git-down": {
      about: "Down from the pull request: the keyboard on Create pull request, which cannot run",
      from: "git",
      sizes: [[70, 24]],
      steps: [{ press: "Down" }, { sleep: 300 }],
    },
    "git-unavailable": {
      about: "4, a row that cannot run: the sheet stays and says why under the rows",
      from: "git",
      sizes: [[70, 24]],
      steps: [settled, { type: "4" }, { wait: "Create pull request: PR #12 is open" }],
    },
    "git-enter": {
      about: "Enter on the preselected pull request: the browser stand-in gets its link",
      from: "git",
      region: region.full,
      sizes: [[70, 24]],
      steps: [
        settled,
        { press: "Enter" },
        closed("Git"),
        logged("launched.log", () => "xdg-open https://github.com/acme/orders-api/pull/12"),
      ],
    },
    "git-copy": {
      about: "5 copies the branch name: the sheet closes and the transcript says what was copied",
      from: "git",
      region: region.full,
      sizes: [[70, 24]],
      steps: [
        settled,
        { type: "5" },
        { wait: "Copied the branch name" },
        logged("copied.log", () => BRANCH),
      ],
    },
    "git-close": {
      about: "a click on Close: the sheet goes and the prompt is in front",
      from: "git",
      region: region.full,
      sizes: [[70, 24]],
      steps: [{ click: "Close ×" }, closed("Git")],
    },
    "git-nobrowser": {
      about: "Enter on a link with no browser installed: the sheet stays and says so",
      setup: checkout,
      start: machine("pr", {}, ["xdg-open"]),
      sizes: [[70, 24]],
      steps: [
        ...git,
        { wait: "Open pull request" },
        settled,
        { press: "Enter" },
        { wait: "No browser app is installed" },
      ],
    },
    "folder-click": {
      about: "a click on VS Code: the editor stand-in gets the checkout",
      from: "folder",
      region: region.full,
      sizes: [[70, 24]],
      steps: [
        settled,
        { click: "VS Code" },
        closed("Open folder"),
        logged("launched.log", (s) => `code ${cwd(s)}`),
      ],
    },
    "folder-escape": {
      about: "Escape closes the menu and starts nothing",
      from: "folder",
      region: region.full,
      sizes: [[70, 24]],
      steps: [{ press: "Escape" }, closed("Open folder")],
    },
    "folder-terminal": {
      about: "Enter on Neovim, preselected: it starts in a terminal window in the checkout",
      from: "folder-config",
      region: region.full,
      sizes: [[70, 24]],
      steps: [
        settled,
        { press: "Enter" },
        closed("Open folder"),
        logged(
          "launched.log",
          (s) =>
            `xdg-terminal-exec --dir=${cwd(s)} ${join(s.runDir, "bin", "nvim-stub")} ${cwd(s)}`,
        ),
      ],
    },
    "folder-broken-config": {
      about: "an open.json that is not JSON: the built-in apps, and under them what went wrong",
      setup: withBrokenConfig,
      start: machine("pr"),
      steps: [...folder, { wait: "open.json is not JSON" }],
    },
    "folder-wont-start": {
      about: "Enter on an app that will not start: the sheet closes and the transcript says so",
      setup: withBrokenApp,
      start: machine("pr", { "broken-stub": BROKEN }),
      region: region.full,
      sizes: [[70, 24]],
      steps: [
        ...folder,
        { wait: "Broken editor" },
        settled,
        { press: "Enter" },
        { wait: "Couldn't start" },
      ],
    },
  },
});
