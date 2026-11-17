import { region } from "../lib/screen.ts";
import { scenarios } from "../lib/scenario.ts";
import { checkout, EXTREME, fileSuggestions, MANY, ONE, STRUCTURED } from "./fixture.ts";

const open = [{ type: "/docfix" }, { press: "Enter" }];

export default scenarios({
  plugin: "docfix",
  harness: "claude",
  // Below 110 columns the pane is a box over the transcript, from 110 a column beside it.
  region: region.any(region.sidebar, region.box()),
  // The age of a suggestion, `2d`: a fixture filed a moment ago would read `0m` or `1m`.
  mask: [{ pattern: /(?<=\s)\d+[mhd](?=\s|$)/g, with: "age" }],
  scenarios: {
    empty: {
      about: "/docfix in a checkout with no suggestions filed",
      setup: checkout,
      steps: [...open, { wait: "Nothing to review" }],
    },
    one: {
      about: "/docfix with a single open suggestion",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, ONE);
      },
      steps: [...open, { wait: "AGENTS.md" }],
    },
    queue: {
      about: "/docfix with three open suggestions (one more is dismissed and hidden)",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx);
      },
      steps: [...open, { wait: "AGENTS.md" }],
      extreme: true,
    },
    inline: {
      about: "the pane inline at 100 columns, wide enough for metadata in columns",
      from: "queue",
      size: [100, 36],
    },
    marked: {
      about: "two of the three marked by a click on their claims",
      from: "queue",
      steps: [{ click: "is not enough" }, { click: "legacy" }],
    },
    group: {
      about: "a click on a doc's header marks all its rows",
      from: "queue",
      steps: [{ click: "docs/hosts.md" }],
    },
    folded: {
      about: "a click on a row's evidence line folds that row's evidence",
      from: "queue",
      steps: [{ click: "evidence 1" }],
    },
    collapsed: {
      about: "e hides every row's evidence, and the key now offers to show it",
      from: "queue",
      steps: [{ press: "e" }],
    },
    hover: {
      about: "the pointer on a row: the engine lights it as it does the focused one",
      from: "queue",
      steps: [{ hover: "legacy" }],
    },
    keyboard: {
      about:
        "Down twice moves the ring past the first row's evidence line onto the second row; Enter marks it",
      from: "queue",
      steps: [{ press: ["Down", "Down", "Enter"] }],
    },
    dismissed: {
      about:
        "d on a clicked (marked) row: the queue one shorter, the ring on the row that took its place, undo offered",
      from: "queue",
      // A session that has been resized no longer gives the pane the keyboard on a click
      // (Claude Code, 2.1.325), so this one starts its own.
      fresh: true,
      steps: [{ click: "is not enough" }, { press: "d" }, { wait: "Dismissed 1" }],
    },
    undone: {
      about: "u after a dismiss: the suggestion is back and the ring is on it",
      from: "dismissed",
      fresh: true,
      steps: [{ press: "u" }, { wait: "Restored 1" }],
    },
    applied: {
      about:
        "a on two marked rows: the pane closes and the prompt box holds one drafted prompt, unsent",
      from: "queue",
      region: region.full,
      // The debug banner above the transcript names a run folder, which wraps at 70 columns.
      mask: [{ pattern: /e2e-[A-Za-z0-9]{6}/g, with: "e2e-run" }],
      steps: [
        { click: "is not enough" },
        { click: "legacy" },
        { press: "a" },
        { wait: "Apply these docfix" },
      ],
    },
    evidence: {
      about:
        "evidence as migrated memories write it: prose, a labelled paragraph, citations as a list not JSON",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, STRUCTURED);
      },
      steps: [...open, { wait: "agent-hub" }],
      extreme: true,
    },
    many: {
      about:
        "28 suggestions, more than fit: their evidence starts folded, and the pane scrolls as a whole",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, MANY);
      },
      steps: [...open, { wait: "Claim number" }],
    },
    extreme: {
      about: "very long claims, evidence and paths, wide characters, one unbroken word",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, EXTREME);
      },
      steps: [...open, { wait: "AGENTS.md" }],
      extreme: true,
    },
  },
});
