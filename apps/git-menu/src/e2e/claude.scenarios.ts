import { region } from "@agents/drive/lib/screen.ts";
import { scenarios, slashCommand } from "@agents/drive/lib/scenario.ts";
import { checkout, LONG_BASE, LONG_NOTES, MANY_NOTES, NOTES, start, withNotes } from "./fixture.ts";

const git = [slashCommand("git", "Open the git menu"), { press: "Enter" }];
const folder = [slashCommand("open", "Open the folder menu"), { press: "Enter" }];
const plan = [slashCommand("open", "Open the folder menu"), { type: " plan" }, { press: "Enter" }];

export default scenarios({
  plugin: "git-menu",
  harness: "claude",
  // Hermetic: its own config with this plugin alone, so nothing of the person's setup shows.
  start: { hermetic: true, plugins: ["git-menu"], args: ["--model", "haiku"] },
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
    notes: {
      about: "/open plan with a few notes, newest first",
      setup: withNotes(NOTES),
      start: start("pr"),
      steps: [...plan, { wait: "retry-after.md" }],
    },
    "notes-many": {
      about: "/open plan with more notes than a pane holds",
      setup: withNotes(MANY_NOTES),
      start: start("pr"),
      steps: [...plan, { wait: "session-01.md" }],
      extreme: true,
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
      extreme: true,
    },
  },
});
