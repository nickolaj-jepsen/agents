import { findText, region, type Region } from "@agents/drive/lib/screen.ts";
import { scenarios } from "@agents/drive/lib/scenario.ts";
import {
  APPS,
  checkout,
  ENV,
  extreme,
  launched,
  outside,
  tracked,
  withLargeNote,
  withLongNote,
  withNotes,
  WRITTEN,
} from "./fixture.ts";

const open = [{ type: "/notes" }, { press: "Enter" }];

/**
 * The sidebar: from its divider to the right of the screen, and from its caption rule, which
 * holds Close, down as far as the divider runs: to the editor.
 */
const sidebar: Region = (grid) => {
  const [close] = findText(grid, /Close ×/);
  if (!close) return undefined;
  const cols = grid[0]?.length ?? 0;
  let x = close.x;
  while (x > 0 && grid[close.y]?.[x]?.char !== "│") x--;
  if (grid[close.y]?.[x]?.char !== "│") return undefined;
  let end = close.y;
  while (grid[end + 1]?.[x]?.char === "│") end++;
  return { x, y: close.y, w: cols - x, h: end - close.y + 1 };
};

/** The driver has no wheel call: an SGR mouse report, button 65 down, at a cell. */
const wheel = (x: number, y: number, times = 3) => ({
  run: async (s: { term: { write(data: string): unknown } }) => {
    for (let i = 0; i < times; i++) {
      await s.term.write(`\x1b[<65;${x};${y}M`);
      await new Promise((r) => setTimeout(r, 150));
    }
  },
});

/** A run that writes one note under `.agents/store`, then says so. */
const WRITE_TURNS = [
  {
    text: "I'll write the plan down so the next session finds it.",
    toolCall: { name: "write", arguments: { path: WRITTEN.path, content: WRITTEN.text } },
  },
  { text: "The plan is in .agents/store/plans/backoff.md." },
];

export default scenarios({
  plugin: "notes",
  harness: "pi",
  // Hermetic: its own config with this plugin alone, its stores in the run's own folder.
  start: { hermetic: true, plugins: ["notes"], turns: [], env: ENV, ...APPS },
  region: sidebar,
  scenarios: {
    list: {
      about:
        "/notes: notes under their folders, the newest first, ages at the right, artefacts counted beside their folder, a folder of artefacts alone",
      setup: withNotes,
      steps: [...open, { wait: "retry-after.md" }],
    },
    empty: {
      about: "/notes in a checkout whose store holds nothing yet",
      setup: checkout,
      steps: [...open, { wait: "No notes yet" }],
    },
    outside: {
      about: "/notes in a folder in no git repository: no store, and nothing made",
      setup: outside,
      steps: [...open, { wait: "no git repository" }],
    },
    tracked: {
      about:
        "a .agents/store that git tracks: left alone, a notice over the list, its notes listed",
      setup: tracked,
      steps: [...open, { wait: "kept.md" }],
    },
    extreme: {
      about:
        "more notes than fit, a long nested path, wide characters, a folder of 40 artefacts; the window counts what it hides",
      setup: extreme,
      steps: [...open, { wait: "Close ×" }],
      extreme: true,
    },
    reader: {
      about:
        "Enter on a long Markdown note: its path, its folder and age on the rule, its text as prose",
      setup: withLongNote,
      steps: [...open, { wait: "retry-after.md" }, { press: "Enter" }, { wait: "Back ↵" }],
      extreme: true,
    },
    readerScrolled: {
      about: "the arrows scroll the reader, which says how many rows are above and below",
      from: "reader",
      sizes: [[160, 45]],
      steps: [{ press: Array(12).fill("Down") }, { wait: "↑ 13 more" }],
    },
    readerWheel: {
      about: "the wheel over the reader scrolls it",
      from: "reader",
      fresh: true,
      size: [160, 45],
      sizes: [[160, 45]],
      steps: [wheel(130, 12), { wait: "↑ 10 more" }],
    },
    readerBack: {
      about: "Escape in the reader goes back to the list at the same row",
      from: "list",
      sizes: [[160, 45]],
      steps: [
        { press: "Down" },
        { wait: "❯ hub/PLAN.md" },
        { press: "Enter" },
        { wait: "Back ↵" },
        { press: "Escape" },
        { wait: "❯ hub/PLAN.md" },
      ],
    },
    readerClicked: {
      about: "a click on a row reads it; a click on Back leaves it",
      from: "list",
      sizes: [[160, 45]],
      steps: [
        { click: "rate-limits.md" },
        { wait: "120 a minute per key" },
        { click: "Back ↵" },
        { wait: "Read ↵" },
      ],
    },
    large: {
      about: "a note over 256 KiB is not read in the sidebar: the reader says so and lights Open",
      setup: withLargeNote,
      steps: [...open, { wait: "sync-run.md" }, { press: "Enter" }, { wait: "too large" }],
    },
    opened: {
      about: "o hands the note to VS Code (a stand-in), and Enter on an HTML note to the browser",
      from: "list",
      sizes: [[160, 45]],
      steps: [
        { press: "o" },
        {
          run: (s) =>
            launched(s.runDir, /^code --reuse-window --goto .*\/plans\/retry-after\.md$/m),
        },
        { click: "sync-latency.html" },
        { run: (s) => launched(s.runDir, /^xdg-open file:\/\/.*\/reports\/sync-latency\.html$/m) },
      ],
    },
    band: {
      about:
        "a run wrote a note: the widget above the prompt names it and /notes, a draft typed under it",
      setup: checkout,
      start: { turns: WRITE_TURNS },
      region: region.rows(/Note written|notes written/, /a draft/),
      steps: [
        { type: "write the plan down" },
        { press: "Enter" },
        { wait: "Note written: plans/backoff.md", timeout: 30_000 },
        { type: "a draft" },
      ],
    },
    bandClicked: {
      about: "a click on the widget reads the note in the sidebar, and the widget steps aside",
      from: "band",
      region: sidebar,
      // The note was written moments ago: its age and the rule after it, which keep one width.
      mask: [{ pattern: /(?<=── )(?:now|\d+m) ─+/g, with: "<age>" }],
      steps: [{ click: "Note written" }, { wait: "Back ↵" }],
    },
  },
});
