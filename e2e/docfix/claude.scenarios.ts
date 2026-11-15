import { region } from "../lib/screen.ts";
import { scenarios } from "../lib/scenario.ts";
import { checkout, EXTREME, fileSuggestions, MANY, ONE } from "./fixture.ts";

const open = [{ type: "/docfix" }, { press: "Enter" }];

export default scenarios({
  plugin: "docfix",
  harness: "claude",
  // Below 110 columns the pane is a box over the transcript, from 110 a column beside it.
  region: region.any(region.sidebar, region.box(/Doc suggestions/)),
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
      about: "two of the three marked by a click",
      from: "queue",
      steps: [{ click: "is not enough" }, { click: "legacy" }],
    },
    focused: {
      about:
        "Tab walks the ring onto a row: the engine inverts it and its evidence shows below the list",
      from: "queue",
      steps: [{ press: "Tab" }, { press: "Tab" }],
    },
    notice: {
      about: "apply with nothing marked or focused: the warning line",
      from: "queue",
      steps: [{ press: "a" }, { wait: "Mark a suggestion" }],
    },
    dismissed: {
      about: "the success line after a dismiss, the queue one shorter",
      from: "queue",
      steps: [{ click: "legacy" }, { press: "d" }, { wait: "Dismissed 1" }],
    },
    many: {
      about: "28 suggestions, more than fit; the pane scrolls as a whole",
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
