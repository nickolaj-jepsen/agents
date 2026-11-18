import type { Turn } from "../lib/harness.ts";
import { poster, site, slow, type SiteScenario } from "../lib/site.ts";
import { checkout, fileSuggestions, SUGGESTIONS } from "./fixture.ts";

/** Two suggestions are already waiting; the turn files a third. */
const setup: SiteScenario["setup"] = (ctx) => {
  checkout(ctx);
  fileSuggestions(ctx, SUGGESTIONS.slice(1, 3));
};

const FILED_ID = "agents--just-build-is-not-enough-to-verify-a-pi-change";
const LEGACY_ID = "hosts-md-describes-removed-card";

const FILED = {
  action: "suggest",
  file: "AGENTS.md",
  kind: "wrong",
  claim: "`just build` is not enough to verify a pi change; the docs say it is.",
  evidence:
    "AGENTS.md says `just build` verifies a change, but the build only type-checks the pi halves and never starts pi.",
  same_as: "none",
};

const turns: Turn[] = [
  {
    text: "README.md now points at `just dev-setup`. AGENTS.md still says `just build` verifies a pi change, which it doesn't; that file is outside this change, so I'll file it for review.",
    toolCall: { name: "mcp__docfix__docfix", arguments: FILED },
  },
  { text: "Filed. The install steps in README.md are updated; nothing else was touched." },
  // Closing drafts one prompt for every row set to apply and the demo sends it; the model resolves both.
  { toolCall: { name: "mcp__docfix__docfix", arguments: { action: "resolve", id: FILED_ID } } },
  { toolCall: { name: "mcp__docfix__docfix", arguments: { action: "resolve", id: LEGACY_ID } } },
  { text: "Both claims checked against the code and resolved; nothing is committed." },
];

/** The same story in pi, where the tool is `docfix`; applying one keeps it to one resolve. */
const PI_TURNS: Turn[] = [
  {
    text: turns[0]!.text,
    toolCall: { name: "docfix", arguments: FILED },
  },
  turns[1]!,
  { toolCall: { name: "docfix", arguments: { action: "resolve", id: FILED_ID } } },
  { text: "The `just build` claim checked against the code and resolved." },
];

const ask = "Point the install steps in README.md at `just dev-setup`";
/** The first row to apply, and the next one to apply too. */
const ROWS = [{ press: "a" }, { sleep: 1200 }, { press: "Down" }, { sleep: 1200 }, { press: "a" }];

export default site({
  plugin: "docfix",
  demo: [
    {
      caption:
        "The agent files a doc suggestion instead of editing a doc outside its change; /docfix lists them, and closing it drafts the ones set to apply as a prompt for you to send.",
      project: "shop-api",
      setup,
      start: {
        hermetic: true,
        args: ["--allowedTools", "mcp__docfix__docfix"],
        turns,
      },
      steps: [
        { sleep: 800 },
        slow(ask),
        { press: "Enter" },
        { wait: "Filed. The install steps", timeout: 20_000 },
        { sleep: 1500 },
        slow("/docfix"),
        { press: "Enter" },
        { wait: "Doc suggestions" },
        { sleep: 2600 },
        ...ROWS,
        { sleep: 2400 },
        poster,
        { press: "Escape" },
        // The draft is taller than the prompt box, so its first line has scrolled away.
        { wait: "For each one:" },
        // The draft sits in the prompt box for a moment, to be read; then it is sent.
        { sleep: 3200 },
        { press: "Enter" },
        { wait: "Both claims checked", timeout: 20_000 },
        { sleep: 4500 },
      ],
    },
    {
      harness: "pi",
      caption:
        "pi has the same tool and panel: the agent files the suggestion, /docfix lists them, and closing it drafts the one set to apply as a prompt for you to send.",
      project: "shop-api",
      setup,
      start: { hermetic: true, plugins: ["docfix"], turns: PI_TURNS },
      steps: [
        { sleep: 800 },
        slow(ask),
        { press: "Enter" },
        { wait: "Filed. The install steps", timeout: 20_000 },
        { sleep: 1500 },
        slow("/docfix"),
        { press: "Enter" },
        { wait: "Doc suggestions" },
        { sleep: 2600 },
        { press: "a" },
        { sleep: 2400 },
        poster,
        { press: "Enter" },
        { wait: "For each one:" },
        { sleep: 3200 },
        { press: "Enter" },
        { wait: "claim checked against the code", timeout: 30_000 },
        { sleep: 4500 },
      ],
    },
  ],
  stills: {
    queue: {
      caption:
        "Suggestions are grouped by doc, each with its kind, how often agents hit it and how old it is.",
      project: "shop-api",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx);
      },
      start: { hermetic: true, turns: [] },
      steps: [{ type: "/docfix" }, { press: "Enter" }, { wait: "AGENTS.md" }],
    },
    set: {
      caption: "Set each one to apply, dismiss or skip; closing the pane carries it out.",
      project: "shop-api",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx);
      },
      start: { hermetic: true, turns: [] },
      steps: [
        { type: "/docfix" },
        { press: "Enter" },
        { wait: "AGENTS.md" },
        { press: "a" },
        { press: "Down" },
        { press: "d" },
      ],
    },
    pi: {
      caption: "pi has the same panel and the same tool, from the same core.",
      harness: "pi",
      project: "shop-api",
      setup: (ctx) => {
        checkout(ctx);
        fileSuggestions(ctx);
      },
      start: { hermetic: true, plugins: ["docfix"], turns: [{ text: "ok" }] },
      steps: [
        { type: "/docfix" },
        { press: "Enter" },
        { wait: "AGENTS.md" },
        { press: "a" },
        { press: "Down" },
        { press: "Down" },
        { press: "d" },
        { press: "Space" },
      ],
    },
  },
});
