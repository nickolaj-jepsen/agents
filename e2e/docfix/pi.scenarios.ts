import { findText, type Region } from "../lib/screen.ts";
import { region } from "../lib/screen.ts";
import { scenarios } from "../lib/scenario.ts";
import { checkout, EXTREME, fileSuggestions, MANY, ONE, STRUCTURED } from "./fixture.ts";

const open = [{ type: "/docfix" }, { press: "Enter" }];

/**
 * The sidebar: from its top rule, which holds Close or its question, to its bottom rule, at the
 * right of the screen. The overlay has no border of its own: its left edge is where the bottom
 * rule starts, a blank cell before it.
 */
const sidebar: Region = (grid) => {
  const [close] = findText(grid, /Close ×|Keep \[esc\]/);
  if (!close) return undefined;
  const cols = grid[0]?.length ?? 0;
  for (let y = close.y + 1; y < grid.length; y++) {
    const row = grid[y] ?? [];
    let x = cols;
    while (x > 0 && row[x - 1]?.char === "─") x--;
    if (x > 0 && cols - x >= 40 && row[x - 1]?.char === " ")
      return { x, y: close.y, w: cols - x, h: y - close.y + 1 };
  }
  return undefined;
};

/** The driver has no wheel call: an SGR mouse report, button 65 down and 64 up, at a cell. */
const wheel = (down: boolean, x: number, y: number, times = 3) => ({
  run: async (s: { term: { write(data: string): unknown } }) => {
    for (let i = 0; i < times; i++) {
      await s.term.write(`\x1b[<${down ? 65 : 64};${x};${y}M`);
      await new Promise((r) => setTimeout(r, 150));
    }
  },
});

export default scenarios({
  plugin: "docfix",
  harness: "pi",
  // Hermetic: its own config with this plugin alone, so nothing of the person's setup shows.
  start: { hermetic: true, plugins: ["docfix"], turns: [] },
  region: sidebar,
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
        "/docfix with three open suggestions in three docs, the keyboard on the first; the focused one under the queue",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx);
      },
      steps: [...open, { wait: "AGENTS.md" }],
      extreme: true,
    },
    hover: {
      about: "the pointer on the second row: its claim is bold, the keyboard's pointer stays",
      from: "queue",
      steps: [{ hover: "The legacy card" }],
    },
    clicked: {
      about: "a click on the second row puts the keyboard there; the focused suggestion follows",
      from: "queue",
      steps: [{ click: "The legacy card" }, { wait: "stale · seen" }],
    },
    set: {
      about:
        "a then d: the first applied (accent, filled mark), the second dismissed (dim), each doc decided (green rail), the main action Draft prompt",
      from: "queue",
      steps: [{ press: "a" }, { press: "d" }, { wait: "● 1 · – 1" }],
    },
    clickedSet: {
      about: "a click on Apply sets the keyboard's row and moves to the next row left alone",
      from: "queue",
      steps: [{ click: "Apply [a]" }, { wait: "Draft prompt" }],
    },
    confirm: {
      about:
        "a row applied, then Escape: Close asks in place before it throws the choice away; the footer is dim",
      from: "queue",
      steps: [{ press: "a" }, { press: "Escape" }, { wait: "Discard 1?" }],
    },
    confirmClick: {
      about: "a row applied, then a click on Close: the same question, in the top rule",
      from: "queue",
      steps: [{ press: "a" }, { click: "Close ×" }, { wait: "Keep [esc]" }],
    },
    kept: {
      about: "Keep, clicked: the question goes and the choice stays",
      from: "confirmClick",
      steps: [{ click: "Keep [esc]" }, { wait: "● 1 · – 0" }],
    },
    applied: {
      about:
        "a on two rows, then Enter: the sidebar closes and the editor holds one drafted prompt, unsent",
      from: "queue",
      region: region.full,
      steps: [{ press: "a" }, { press: "a" }, { press: "Enter" }, { wait: "For each one" }],
    },
    dismissed: {
      about: "d, then a click on the main action: the sidebar closes and the footer count drops",
      from: "queue",
      region: region.full,
      steps: [{ press: "d" }, { click: "Dismiss ↵" }, { wait: "docs 2" }],
    },
    reader: {
      about:
        "e opens the reader on a suggestion with two pieces of evidence: the reason first, what it points at as keyed rows, Next on the evidence line",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, STRUCTURED);
      },
      steps: [...open, { wait: "agent-hub" }, { press: "e" }, { wait: "Evidence 1 of 2" }],
      extreme: true,
    },
    readerNext: {
      about: "n in the reader: the second, migrated piece of evidence",
      from: "reader",
      steps: [{ press: "n" }, { wait: "Evidence 2 of 2" }],
    },
    readerClicked: {
      about: "a click on the focused suggestion opens the reader; a click on Back leaves it",
      from: "queue",
      steps: [
        { click: "Read [e]" },
        { wait: "Back [esc]" },
        { click: "Back [esc]" },
        { wait: "Read [e]" },
      ],
    },
    readerSet: {
      about: "a in the reader: its row set to apply, the reader stays on it; its first row says so",
      from: "reader",
      steps: [{ press: "a" }, { wait: "● 1 ·" }],
    },
    markClick: {
      about:
        "a click on a row's mark sets it to apply, a second to dismiss; the keyboard goes there",
      from: "queue",
      steps: [{ click: "○ T" }, { wait: "● 1 ·" }, { click: "● T" }, { wait: "– 1 ·" }],
    },
    applyAll: {
      about: "a click on Apply all on the keyboard's doc row sets every row of the doc",
      from: "many",
      steps: [{ click: "Apply all" }, { wait: "● 4 ·" }],
    },
    many: {
      about:
        "28 suggestions in 8 docs, more than fit: the keyboard's doc row on top of the window, the last row saying what is hidden",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, MANY);
      },
      steps: [...open, { wait: "Claim number" }, { press: Array(12).fill("Down") }],
    },
    wholeDoc: {
      about:
        "A on a doc of several rows: every row applied, its rail green, the keyboard on the next doc",
      from: "many",
      steps: [{ press: "A" }, { wait: "● 4 ·" }],
    },
    wheel: {
      about: "the wheel over the queue moves its window, not the keyboard",
      from: "many",
      // A window depends on the size it was drawn at, so this starts its own session.
      fresh: true,
      size: [160, 45],
      sizes: [[160, 45]],
      steps: [wheel(true, 130, 8), { sleep: 300 }],
    },
    extreme: {
      about:
        "very long claims, evidence and paths, wide characters, one unbroken word; the focused suggestion cut with ↓ more",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, EXTREME);
      },
      steps: [...open, { wait: "AGENTS.md" }],
      extreme: true,
    },
    short: {
      about:
        "a terminal of 18 rows: no blank row under the caption; the focused suggestion is its claim and the evidence rule",
      from: "queue",
      sizes: [[100, 18]],
    },
  },
});
