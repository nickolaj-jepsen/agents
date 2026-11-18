import { region, type Region } from "../lib/screen.ts";
import { scenarios } from "../lib/scenario.ts";
import { checkout, EXTREME, fileSuggestions, MANY, ONE, STRUCTURED } from "./fixture.ts";

const open = [{ type: "/docfix" }, { press: "Enter" }];

/** The whole screen but the footer's two rows, whose folder path shows only now and then. */
const aboveFooter: Region = (grid) => ({
  x: 0,
  y: 0,
  w: grid[0]?.length ?? 0,
  h: Math.max(1, grid.length - 2),
});

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
      about:
        "/docfix with three open suggestions, folded, the first row's keys lit (one more is dismissed and hidden)",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx);
      },
      steps: [...open, { wait: "AGENTS.md" }],
      extreme: true,
    },
    band: {
      about: "the count above the prompt, a draft typed (it hides the prompt's random placeholder)",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx);
      },
      // From the band to the draft: the footer under it shows the folder only now and then.
      region: region.rows(/docfix: docs 3/, /a draft/),
      steps: [{ wait: "docfix: docs 3" }, { type: "a draft" }],
    },
    bandClicked: {
      about: "a click on the count above the prompt opens the pane, and the count steps aside",
      from: "band",
      region: region.any(region.sidebar, region.box()),
      steps: [{ click: "docfix: docs 3" }, { wait: "Doc suggestions" }],
    },
    inline: {
      about: "the pane inline at 100 columns",
      from: "queue",
      size: [100, 36],
    },
    set: {
      about:
        "a on the first row and d on the second: one claim in success, one struck through, and the line under the title says what closing does",
      from: "queue",
      // A resized session loses the pane's keyboard on a click (Claude Code 2.1.325), so start fresh.
      fresh: true,
      steps: [{ press: "a" }, { press: "Down" }, { press: "d" }],
    },
    clicked: {
      about: "a click on the last row's dismiss sets it; the ring stays on the first row",
      from: "queue",
      steps: [{ click: { text: /dismiss(?=  skip\s*$)/m, nth: 1 } }],
    },
    opened: {
      about: "a click on a row's claim opens it: its claim whole and its evidence",
      from: "queue",
      steps: [{ click: "legacy" }],
    },
    hover: {
      about: "the pointer on a row: the engine lights it as it does the focused one",
      from: "queue",
      steps: [{ hover: "legacy" }],
    },
    keyboard: {
      about:
        "Down moves the ring past the first row's evidence line and keys onto the second row, whose keys light",
      from: "queue",
      fresh: true,
      steps: [{ press: "Down" }],
    },
    dismissed: {
      about:
        "d on the first row, then Esc: the pane closes, a toast says one was dismissed, and the status count drops",
      from: "queue",
      region: aboveFooter,
      mask: [{ pattern: /e2e-[A-Za-z0-9]{6}/g, with: "e2e-run" }],
      // The toast is gone by the time a resize to a second size settles: one size only.
      sizes: [[160, 45]],
      fresh: true,
      steps: [
        { press: "d" },
        { wait: "On close: dismiss 1" },
        { press: "Escape" },
        { wait: "Dismissed 1" },
      ],
    },
    submitted: {
      about:
        "d on the first row, then a click on submit: the pane closes, a toast says one was dismissed",
      from: "queue",
      region: aboveFooter,
      mask: [{ pattern: /e2e-[A-Za-z0-9]{6}/g, with: "e2e-run" }],
      // The toast is gone by the time a resize to a second size settles: one size only.
      sizes: [[160, 45]],
      fresh: true,
      steps: [
        { press: "d" },
        { wait: "On close: dismiss 1" },
        { click: "[ submit ]" },
        { wait: "Dismissed 1" },
      ],
    },
    applied: {
      about:
        "a on two rows, then Esc: the pane closes and the prompt box holds one drafted prompt, unsent",
      from: "queue",
      region: aboveFooter,
      // The debug banner above the transcript names a run folder, which wraps at 70 columns.
      mask: [{ pattern: /e2e-[A-Za-z0-9]{6}/g, with: "e2e-run" }],
      fresh: true,
      steps: [
        { press: "a" },
        // Down from the first row lands on the next row. Keys sent in one write can beat the
        // ring's move, so each is a step of its own.
        { press: "Down" },
        { press: "a" },
        { wait: "On close: apply 2" },
        { press: "Escape" },
        // The draft is taller than the prompt box, so its first line has scrolled away.
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
      about: "28 suggestions, more than fit: every row folded, and the pane scrolls as a whole",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, MANY);
      },
      steps: [...open, { wait: "Claim number" }],
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
  },
});
