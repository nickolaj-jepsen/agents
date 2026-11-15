import { region } from "../lib/screen.ts";
import { scenarios } from "../lib/scenario.ts";
import { checkout, EXTREME, fileSuggestions, MANY, ONE } from "./fixture.ts";

const open = [{ type: "/docfix" }, { press: "Enter" }];

export default scenarios({
  plugin: "docfix",
  harness: "pi",
  region: region.box(/Doc suggestions/),
  // The age of a suggestion: "2d", "1mo", "today" in the list and "2 days ago" beside it.
  mask: [{ pattern: /\b\d+(?:d|mo)\b|\btoday\b|\b\d+ days? ago\b/g, with: "<age>" }],
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
    marked: {
      about: "two of the three marked, the cursor on the second",
      from: "queue",
      steps: [{ press: "Space" }, { press: "Down" }, { press: "Space" }],
    },
    hover: {
      about: "the pointer over the second row: its title bold, the cursor still on the first",
      from: "queue",
      steps: [{ hover: "legacy" }],
    },
    dismissed: {
      about: "the notice after a dismiss, the queue one shorter",
      from: "queue",
      steps: [{ press: "d" }, { wait: "Dismissed 1" }],
    },
    many: {
      about: "28 suggestions, more than fit; the cursor well down the list",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, MANY);
      },
      steps: [...open, { wait: "Claim number" }, { press: Array(20).fill("Down") }],
    },
    wheel: {
      about: "three wheel-up events over the list move the cursor up three rows",
      from: "many",
      // Where a list's window sits depends on the sizes it has been drawn at, so this one
      // does not continue in the session `many` was resized in.
      fresh: true,
      steps: [
        {
          // The driver has no wheel call: send the SGR sequence (button 64 is wheel up).
          run: async (s) => {
            for (let i = 0; i < 3; i++) {
              await s.term.write("\x1b[<64;60;20M");
              await new Promise((r) => setTimeout(r, 200));
            }
          },
        },
        { sleep: 300 },
      ],
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
