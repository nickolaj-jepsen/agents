import { region, type Region } from "../lib/screen.ts";
import { scenarios, slashCommand } from "../lib/scenario.ts";
import { checkout, EXTREME, fileSuggestions, MANY, ONE, STRUCTURED } from "./fixture.ts";

const open = [slashCommand("docfix", "Review the doc suggestions"), { press: "Enter" }];

/** The whole screen but the footer's two rows, whose folder path shows only now and then. */
const aboveFooter: Region = (grid) => ({
  x: 0,
  y: 0,
  w: grid[0]?.length ?? 0,
  h: Math.max(1, grid.length - 2),
});

/** The driver has no wheel call: an SGR mouse report, button 65 down, at a cell. */
const wheel = (x: number, y: number, times = 3) => ({
  run: async (s: { term: { write(data: string): unknown } }) => {
    for (let i = 0; i < times; i++) {
      await s.term.write(`\x1b[<65;${x};${y}M`);
      await new Promise((r) => setTimeout(r, 150));
    }
  },
});

export default scenarios({
  plugin: "docfix",
  harness: "claude",
  // Hermetic: its own config with this plugin alone, so nothing of the person's setup shows.
  start: { hermetic: true, plugins: ["docfix"], turns: [], args: ["--model", "haiku"] },
  // Below 110 columns the pane is a box above the prompt, from 110 a column beside it.
  region: region.any(region.sidebar, region.box()),
  // When a piece of evidence was filed: the reader's evidence line shows its date.
  mask: [{ pattern: /\b\d{4}-\d{2}-\d{2}\b/g, with: "<date>" }],
  scenarios: {
    empty: {
      about: "/docfix in a checkout with no open suggestions: the frame and one dim line",
      setup: checkout,
      steps: [...open, { wait: "No open suggestions" }],
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
        "/docfix with three open suggestions in three docs, the keyboard on the first; at 70x24 the pane above the prompt has six rows: the caption, two rows carrying their doc, the footer",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx);
      },
      steps: [...open, { wait: "Close ×" }],
      extreme: true,
    },
    narrow: {
      about: "a 110-column terminal: the pane docked at 48 columns",
      from: "queue",
      size: [110, 32],
      sizes: [[110, 32]],
      fresh: true,
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
      steps: [{ click: "docfix: docs 3" }, { wait: "Close ×" }],
    },
    hover: {
      about: "the pointer on the second row: it sits on a soft fill, the keyboard's pointer stays",
      from: "queue",
      sizes: [[160, 45]],
      steps: [{ hover: "The legacy card" }],
    },
    clicked: {
      about: "a click on the second row puts the keyboard there; the focused suggestion follows",
      from: "queue",
      sizes: [[160, 45]],
      steps: [{ click: "The legacy card" }, { wait: "stale · seen" }],
    },
    keyboard: {
      about: "Down moves the keyboard to the second row",
      from: "queue",
      sizes: [[160, 45]],
      fresh: true,
      steps: [{ press: "Down" }, { wait: "stale · seen" }],
    },
    set: {
      about:
        "a then d: the first applied (accent, filled mark), the second dismissed (dim), each doc decided (green rail), the main action Draft prompt",
      from: "queue",
      sizes: [[160, 45]],
      fresh: true,
      // Keys sent in one write can beat the redraw, so each is a step of its own.
      steps: [{ press: "a" }, { wait: "● 1 ·" }, { press: "d" }, { wait: "– 1 ·" }],
    },
    clickedSet: {
      about: "a click on Apply sets the keyboard's row and moves to the next row left alone",
      from: "queue",
      sizes: [[160, 45]],
      steps: [{ click: "Apply [a]" }, { wait: "Draft prompt" }],
    },
    confirm: {
      about:
        "a row applied, then Escape: the pane stays and Close asks in place before it throws the choice away",
      from: "queue",
      sizes: [[160, 45]],
      fresh: true,
      steps: [
        { press: "a" },
        { wait: "● 1 ·" },
        { sleep: 300 },
        { press: "Escape" },
        { wait: "Discard 1?" },
      ],
    },
    confirmClick: {
      about: "a row applied, then a click on Close: the same question, in the top rule",
      from: "queue",
      sizes: [[160, 45]],
      steps: [
        { click: "Apply [a]" },
        { wait: "Draft prompt" },
        { click: "Close ×" },
        { wait: "Keep [esc]" },
      ],
    },
    applied: {
      about:
        "a on two rows, then Enter: the pane closes and the prompt box holds one drafted prompt, unsent",
      from: "queue",
      region: aboveFooter,
      // The debug banner above the transcript names a run folder, which wraps at 70 columns.
      mask: [{ pattern: /e2e-[A-Za-z0-9]{6}/g, with: "e2e-run" }],
      sizes: [[160, 45]],
      fresh: true,
      steps: [
        { press: "a" },
        { wait: "● 1 ·" },
        { press: "a" },
        { wait: "● 2 ·" },
        { press: "Enter" },
        // The draft is taller than the prompt box, so its first line has scrolled away.
        { wait: "For each one" },
      ],
    },
    dismissed: {
      about:
        "d, then a click on the main action: the pane closes, a toast says one was dismissed, the count drops",
      from: "queue",
      region: aboveFooter,
      mask: [{ pattern: /e2e-[A-Za-z0-9]{6}/g, with: "e2e-run" }],
      // The toast is gone by the time a resize to a second size settles: one size only.
      sizes: [[160, 45]],
      fresh: true,
      steps: [{ press: "d" }, { wait: "– 1 ·" }, { click: "Dismiss ↵" }, { wait: "Dismissed 1" }],
    },
    reader: {
      about:
        "e opens the reader on a suggestion with two pieces of evidence: the reason first, what it points at as keyed rows, Next on the evidence line",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, STRUCTURED);
      },
      steps: [...open, { wait: "agent-hub" }, { press: "e" }, { wait: "Back [esc]" }],
    },
    readerSet: {
      about: "a in the reader: its row set to apply, the reader stays on it; its first row says so",
      from: "reader",
      sizes: [[160, 45]],
      fresh: true,
      steps: [{ sleep: 300 }, { press: "a" }, { wait: "● 1 ·" }],
    },
    readerNext: {
      about: "a click on Next in the reader: the second, migrated piece of evidence",
      from: "reader",
      sizes: [[160, 45]],
      steps: [{ click: "Next [n]" }, { wait: "Evidence 2 of 2" }],
    },
    readerBack: {
      about: "Escape in the reader goes back to the queue; the pane stays",
      from: "reader",
      sizes: [[160, 45]],
      fresh: true,
      steps: [{ sleep: 300 }, { press: "Escape" }, { wait: "Read [e]" }],
    },
    many: {
      about:
        "28 suggestions in 8 docs, more than fit: the keyboard's doc row on top of the window, the last row saying what is hidden",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, MANY);
      },
      sizes: [[160, 45]],
      steps: [
        ...open,
        { wait: "Claim number" },
        ...Array.from({ length: 12 }, () => [{ press: "Down" }, { sleep: 80 }]).flat(),
        { sleep: 300 },
      ],
    },
    markClick: {
      about:
        "a click on a row's mark sets it to apply, a second to dismiss; the keyboard goes there",
      from: "queue",
      sizes: [[160, 45]],
      steps: [{ click: "○ T" }, { wait: "● 1 ·" }, { click: "● T" }, { wait: "– 1 ·" }],
    },
    applyAll: {
      about: "a click on Apply all on the keyboard's doc row sets every row of the doc",
      from: "many",
      fresh: true,
      steps: [{ click: "Apply all" }, { wait: "● 4 ·" }],
    },
    wheel: {
      about: "the wheel over the queue moves its window, not the keyboard",
      from: "many",
      sizes: [[160, 45]],
      fresh: true,
      steps: [wheel(130, 8), { sleep: 300 }],
    },
    extreme: {
      about:
        "very long claims, evidence and paths, wide characters, one unbroken word; the focused suggestion cut with ↓ more",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, EXTREME);
      },
      steps: [...open, { wait: "AGENTS.md" }],
      sizes: [
        [112, 32],
        [160, 45],
        [240, 60],
      ],
    },
  },
});
