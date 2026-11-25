import type { Turn } from "@agents/drive/lib/harness.ts";
import { poster, site, slow } from "@agents/drive/lib/site.ts";
import { APPS, ENV, withMemory, withNotes, WRITTEN } from "./fixture.ts";

/** The turn writes a plan under `.agents/store`; the band names it, and a click reads it. */
const turns = (tool: "Write" | "write"): Turn[] => [
  {
    text: "Retries now wait for Retry-After. I'll write the backoff plan down so the next session finds it.",
    toolCall: {
      name: tool,
      arguments:
        tool === "Write"
          ? { file_path: WRITTEN.path, content: WRITTEN.text }
          : { path: WRITTEN.path, content: WRITTEN.text },
    },
  },
  {
    text: "The plan is in .agents/store/plans/backoff.md, which every checkout of the repository sees.",
  },
];

const ask = "Make the sync worker honour Retry-After, and write down the backoff plan";

export default site({
  plugin: "notes",
  demo: [
    {
      caption:
        "A turn writes a plan under .agents/store; the line above the prompt names it, a click reads it, and /notes lists the rest.",
      project: "shop-api",
      setup: withNotes,
      start: {
        hermetic: true,
        plugins: ["notes"],
        env: ENV,
        turns: turns("Write"),
        ...APPS,
      },
      steps: [
        { sleep: 800 },
        slow(ask),
        { press: "Enter" },
        // The link leads outside the working folder, so Claude Code asks before the write.
        { wait: "Do you want to create backoff.md?", timeout: 20_000 },
        { sleep: 1200 },
        { press: "Enter" },
        { wait: "Note written: plans/backoff.md", timeout: 20_000 },
        { sleep: 2000 },
        { click: "Note written" },
        { wait: "Back ↵" },
        { sleep: 2600 },
        poster,
        { press: Array(6).fill("Down") },
        { sleep: 1500 },
        { press: "Escape" },
        { wait: "Read ↵" },
        { sleep: 3000 },
      ],
    },
  ],
  stills: {
    list: {
      caption:
        "/notes lists the store's notes under the folder each is in, newest first, with the other files counted beside their folder and Claude Code's memory last.",
      project: "shop-api",
      setup: withMemory,
      start: { hermetic: true, plugins: ["notes"], turns: [], env: ENV, ...APPS },
      // Typed out whole, with a space: the menu could have `/release-notes` lit on Enter.
      steps: [{ type: "/notes " }, { press: "Enter" }, { wait: "retry-after.md" }],
    },
    pi: {
      caption: "pi draws the same list in a sidebar, here reading a plan.",
      harness: "pi",
      project: "shop-api",
      setup: withNotes,
      start: { hermetic: true, plugins: ["notes"], turns: [{ text: "ok" }], env: ENV, ...APPS },
      steps: [
        { type: "/notes" },
        { press: "Enter" },
        { wait: "retry-after.md" },
        { press: "Enter" },
        { wait: "Back ↵" },
      ],
    },
  },
  vscode: {
    list: {
      caption: "In VS Code, /notes opens the same list as a pane beside the chat.",
      scenario: "list",
    },
    reader: {
      caption: "A note read in the pane, with Back and Open in its toolbar.",
      scenario: "reader",
    },
  },
});
