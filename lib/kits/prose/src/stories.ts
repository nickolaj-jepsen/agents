/** Prose's stories. No host imports. */
import type { KitStory } from "@agents/kit-core/stories.ts";
import { scrolled } from "@agents/kit-core/lines.ts";
import type { ProseOptions } from "./contract.ts";
import { prose } from "./terminal.ts";

// Short enough for the catalogue's stage in a Claude Code pane, which is a third of the rows.
const ISSUE = [
  "The sync worker never reads `Retry-After`, so it retries sooner than the API allows.",
  "",
  "- Read `Retry-After` from the `429` response",
  "- Wait at least that long",
  "  - 再試行の上限は `MAX_DELAY` のまま",
  "- [x] Reproduce it against the stub",
  "- [ ] Cap the wait at `MAX_DELAY`",
  "",
  "| Answer | Today | After |",
  "| --- | --- | --- |",
  "| `429` with `Retry-After: 30` | waits 2 seconds | waits 30 |",
  "",
  "```sh",
  "curl -sI https://shop.example/api/orders | grep -i retry-after",
  "```",
  "",
  "> The API team asked for this twice.",
  "",
  "**Where:** `src/sync.sh`",
].join("\n");

/** The props of the stories that have a graphical drawing too (`stories.gui.tsx`). */
export const proseProps = {
  blocks: { text: ISSUE, options: {} },
  quiet: {
    text: "Filed from `acme/sync-worker` on **fix/retry-after**.",
    options: { isDim: true },
  },
} satisfies Record<string, { text: string; options: ProseOptions }>;

/** A passage that gives way to what follows it, once folded and once opened. */
const PASSAGE = [
  "Which database should the journal use?",
  "",
  "Postgres runs beside the app; SQLite is one file and needs nothing running.",
  "",
  "**Recommended:** Postgres, for the second writer.",
].join("\n");

export const proseExcerptProps = {
  folded: { text: PASSAGE, options: { excerpt: { hit: "more", isOpen: false } } },
  opened: { text: PASSAGE, options: { excerpt: { hit: "more", isOpen: true } } },
} satisfies Record<string, { text: string; options: ProseOptions }>;

export const proseStories: KitStory[] = [
  {
    component: "prose",
    state: "blocks",
    about: "A text of several blocks: paragraphs, a list, a table, code and a quote",
    settings: "prose(text, width)",
    extreme: true,
    width: "dialog",
    gui: true,
    lines: (width) => prose(proseProps.blocks.text, width, proseProps.blocks.options),
  },
  {
    component: "prose",
    state: "window",
    about: "A room too short shows a window: the rows at its edges count what is past them",
    settings: "scrolled(prose(text, width), {rows: 8, top: 2})",
    width: "dialog",
    lines: (width) =>
      scrolled(prose(ISSUE, width), { rows: 8, top: 2, hits: { up: "up", down: "down" } }).rows,
  },
  {
    component: "prose",
    state: "quiet",
    about: "Every word quiet: a text beside the main one",
    settings: "prose(text, width, {isDim: true})",
    width: "dialog",
    gui: true,
    lines: (width) => prose(proseProps.quiet.text, width, proseProps.quiet.options),
  },
  {
    component: "prose",
    state: "excerpt",
    about: "A passage that gives way to what follows it: drawn whole in a terminal",
    settings: "prose(text, width, {excerpt: {hit, isOpen}})",
    width: "dialog",
    gui: true,
    lines: (width) => prose(proseExcerptProps.folded.text, width, proseExcerptProps.folded.options),
  },
];
