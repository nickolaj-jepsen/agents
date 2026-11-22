import { vscodeScenarios } from "@agents/drive/lib/vscode-scenario.ts";
import { checkout, LONG_BASE, LONG_NOTES, MANY_NOTES, NOTES, start, withNotes } from "./fixture.ts";

// A fresh profile may greet with an "Auto mode" notice that takes the first keys typed.
const ready = [{ sleep: 4000 }, { press: "Escape" }];
const git = [...ready, { type: "/git" }, { press: "Enter" }];
const folder = [...ready, { type: "/open" }, { press: "Enter" }];
const plan = [...ready, { type: "/open plan" }, { press: "Enter" }];

export default vscodeScenarios({
  plugin: "git-menu",
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
    notes: {
      about: "/open plan with a few notes, newest first",
      setup: withNotes(NOTES),
      start: start("pr"),
      steps: [...plan, { wait: "retry-after.md" }],
    },
    "notes-many": {
      about: "/open plan with more notes than a screen holds",
      setup: withNotes(MANY_NOTES),
      start: start("pr"),
      steps: [...plan, { wait: "Show 8 more" }],
    },
    "notes-none": {
      about: "/open plan in a checkout with no notes",
      setup: withNotes([]),
      start: start("pr"),
      steps: [...plan, { wait: "No notes yet" }],
    },
    "notes-long": {
      about: "/open plan with a very long path, and one in wide characters",
      setup: withNotes(LONG_NOTES),
      start: start("pr"),
      steps: [...plan, { wait: "PLAN.md" }],
    },
  },
});
