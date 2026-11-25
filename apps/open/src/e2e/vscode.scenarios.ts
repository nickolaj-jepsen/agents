import { vscodeScenarios } from "@agents/drive/lib/vscode-scenario.ts";
import { checkout, LONG_BASE, start, withConfig, withCrowd } from "./fixture.ts";

// A fresh profile may greet with an "Auto mode" notice that takes the first keys typed.
const ready = [{ sleep: 4000 }, { press: "Escape" }];
const git = [...ready, { type: "/git" }, { press: "Enter" }];
const folder = [...ready, { type: "/open" }, { press: "Enter" }];

export default vscodeScenarios({
  plugin: "open",
  harness: "vscode",
  scenarios: {
    git: {
      about: "/git on a pushed branch that has an open pull request",
      setup: checkout,
      start: start("pr"),
      steps: [...git, { wait: "Open pull request" }],
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
      about: "/open with more configured apps than a screen holds, long and wide labels",
      setup: withCrowd,
      start: start("pr"),
      steps: [...folder, { wait: "Open folder" }],
    },
  },
});
