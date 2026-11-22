import { vscodeScenarios } from "@agents/drive/lib/vscode-scenario.ts";
import { checkout, EXTREME, fileSuggestions, MANY, STRUCTURED } from "./fixture.ts";

const open = [{ type: "/docfix" }, { press: "Enter" }];

/** One stubbed reply, so the session starts: it starts on the first prompt or slash command. */
const reply = { turns: [{ text: "Hello from the stub." }] };

const withSuggestions = (ctx: Parameters<typeof checkout>[0]) => {
  checkout(ctx);
  fileSuggestions(ctx);
};

export default vscodeScenarios({
  plugin: "docfix",
  harness: "vscode",
  scenarios: {
    empty: {
      about: "/docfix in a checkout with no suggestions filed",
      setup: checkout,
      start: reply,
      steps: [...open, { wait: "Nothing to review" }],
    },
    band: {
      about: "the count above the prompt after one stubbed turn",
      setup: withSuggestions,
      start: reply,
      steps: [
        { type: "hello" },
        { press: "Enter" },
        { wait: "3 doc suggestions to review", timeout: 30_000 },
      ],
    },
    queue: {
      about:
        "/docfix with the default suggestions: three open, folded, each with apply, dismiss and skip",
      setup: withSuggestions,
      start: reply,
      steps: [...open, { wait: "AGENTS.md" }],
    },
    structured: {
      about: "evidence as migrated memories write it; the first row's evidence opened by a click",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, STRUCTURED);
      },
      start: reply,
      steps: [...open, { wait: "agent-hub" }, { click: "Open" }],
    },
    open: {
      about:
        "the default suggestions with the first row opened: claim, meta, evidence and its choices",
      setup: withSuggestions,
      start: reply,
      steps: [...open, { wait: "AGENTS.md" }, { click: "Open" }],
    },
    set: {
      about: "the default suggestions with one row set to apply, one to dismiss and a doc to skip",
      setup: withSuggestions,
      start: reply,
      steps: [
        ...open,
        { wait: "AGENTS.md" },
        { click: "Open" },
        { click: "Apply" },
        // Opening the next row folds the first, so its Open is the first left.
        { click: "Open" },
        { click: "Dismiss" },
      ],
    },
    many: {
      about: "more suggestions than a screen holds: the first few and a button for the rest",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, MANY);
      },
      start: reply,
      steps: [...open, { wait: "Show 16 more" }],
    },
    extreme: {
      about: "the longest text in every field, a long path and wide characters",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx, EXTREME);
      },
      start: reply,
      steps: [...open, { wait: "Doc suggestions" }, { click: "Open" }],
    },
  },
});
