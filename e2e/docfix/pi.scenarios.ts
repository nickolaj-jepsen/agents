import { region } from "../lib/screen.ts";
import { scenarios } from "../lib/scenario.ts";
import { checkout, EXTREME, fileSuggestions, MANY, ONE, STRUCTURED } from "./fixture.ts";

const open = [{ type: "/docfix" }, { press: "Enter" }];

export default scenarios({
  plugin: "docfix",
  harness: "pi",
  region: region.box(/Doc suggestions/),
  // The age of a suggestion: "2d", "1mo", "today".
  mask: [{ pattern: /\b\d+(?:d|mo)\b|\btoday\b/g, with: "<age>" }],
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
      about:
        "/docfix with three open suggestions, folded, the first row selected (one more is dismissed and hidden)",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx);
      },
      steps: [...open, { wait: "AGENTS.md" }],
      extreme: true,
    },
    set: {
      about:
        "a on the first row and d on the second: one claim in success, one struck through, the line on top says what closing does",
      from: "queue",
      steps: [{ press: "a" }, { press: ["Down", "Down", "d"] }],
    },
    group: {
      about: "Up onto the first doc's header, then d: every row of the doc set to dismiss",
      from: "queue",
      steps: [{ press: ["Up", "d"] }],
    },
    opened: {
      about: "Enter opens the selected row: its claim whole and its evidence under it",
      from: "queue",
      steps: [{ press: "Enter" }],
    },
    all: {
      about: "e opens every row",
      from: "queue",
      steps: [{ press: "e" }],
    },
    clicked: {
      about: "a click on the last row's dismiss selects that row and sets it",
      from: "queue",
      steps: [{ click: { text: "dismiss", nth: 3 } }],
    },
    dismissed: {
      about:
        "d on the first row, then Esc: the panel closes and the footer count drops; /docfix again shows two",
      from: "queue",
      steps: [
        { press: "d" },
        { press: "Escape" },
        { wait: "docs 2" },
        ...open,
        { wait: "Doc suggestions" },
      ],
    },
    applied: {
      about:
        "a on two rows, then Esc: the panel closes and the editor holds one drafted prompt, unsent",
      from: "queue",
      region: region.full,
      steps: [
        { press: "a" },
        { press: ["Down", "Down", "a"] },
        { press: "Escape" },
        { wait: "For each one" },
      ],
    },
    evidence: {
      about:
        "evidence as migrated memories write it, opened: prose, a labelled paragraph, citations as a list not JSON",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, STRUCTURED);
      },
      steps: [...open, { wait: "agent-hub" }, { press: "Enter" }],
      extreme: true,
    },
    many: {
      about: "28 suggestions, more than fit; the selection well down the list, scrolled into view",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, MANY);
      },
      steps: [...open, { wait: "Claim number" }, { press: Array(20).fill("Down") }],
    },
    wheel: {
      about: "three wheel-down events scroll the panel, not the selection",
      from: "many",
      // A window depends on the sizes it was drawn at, so this starts its own session.
      fresh: true,
      steps: [
        {
          // The driver has no wheel call: send the SGR sequence (button 65 is wheel down).
          run: async (s) => {
            for (let i = 0; i < 3; i++) {
              await s.term.write("\x1b[<65;60;20M");
              await new Promise((r) => setTimeout(r, 200));
            }
          },
        },
        { sleep: 300 },
      ],
    },
    extreme: {
      about:
        "very long claims, evidence and paths, wide characters, one unbroken word; the first row opened",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, EXTREME);
      },
      steps: [...open, { wait: "AGENTS.md" }, { press: "Enter" }],
      extreme: true,
    },
    scrolled: {
      about: "the opened extreme row one page down: `↑ n more` above",
      from: "extreme",
      steps: [{ press: "PageDown" }],
    },
  },
});
