import { region } from "@agents/drive/lib/screen.ts";
import { scenarios, slashCommand } from "@agents/drive/lib/scenario.ts";
import { checkout, LONG_BASE, start, withConfig, withCrowd } from "./fixture.ts";

const git = [slashCommand("git", "Open the git menu"), { press: "Enter" }];
const folder = [slashCommand("open", "Open the folder menu"), { press: "Enter" }];

export default scenarios({
  plugin: "open",
  harness: "claude",
  // Hermetic: its own config with this plugin alone, so nothing of the person's setup shows.
  start: { hermetic: true, plugins: ["open"], args: ["--model", "haiku"] },
  // Below 110 columns the pane is a box above the prompt, from 110 a column beside it.
  region: region.any(region.sidebar, region.box()),
  scenarios: {
    git: {
      about: "/git on a pushed branch that has an open pull request",
      setup: checkout,
      start: start("pr"),
      steps: [...git, { wait: "Open pull request" }],
      extreme: true,
    },
    "git-new": {
      about: "/git on a pushed branch with no pull request yet: create is offered",
      setup: checkout,
      start: start("none"),
      steps: [...git, { wait: "Create pull request" }],
    },
    "git-long": {
      about: "/git where the pull request would go into a very long branch name",
      setup: (ctx) => checkout(ctx, "feature/retry-after", LONG_BASE),
      start: start("none"),
      steps: [...git, { wait: "Create pull request" }],
    },
    folder: {
      about: "/open: Code, the file manager and a terminal installed; Sublime Merge and Zed not",
      setup: checkout,
      start: start("pr"),
      steps: [...folder, { wait: "Open folder" }],
    },
    "folder-config": {
      about: "/open with an open.json: Neovim in a terminal first, the file manager hidden",
      setup: withConfig,
      start: start("pr"),
      steps: [...folder, { wait: "Neovim" }],
    },
    "folder-crowd": {
      about:
        "/open with more configured apps than a pane holds, long and wide labels, some missing",
      setup: withCrowd,
      start: start("pr"),
      steps: [...folder, { wait: "Open folder" }],
      extreme: true,
    },
  },
});
