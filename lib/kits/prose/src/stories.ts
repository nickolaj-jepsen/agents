/** Prose's stories: the model as data, and what each drawing adds. No host imports. */
import type { GuiExt, StageExt, Story } from "@agents/kit-core/stories.ts";
import type { ProseModel } from "./model.ts";

/** What the terminal adds to the window story: the rows the room shows, and where it starts. */
export type TerminalExt = StageExt & { window?: { rows: number; top: number } };

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

/** A passage that gives way to what follows it, once folded and once opened. */
const PASSAGE = [
  "Which database should the journal use?",
  "",
  "Postgres runs beside the app; SQLite is one file and needs nothing running.",
  "",
  "**Recommended:** Postgres, for the second writer.",
].join("\n");

const DIALOG = { stage: "dialog" } as const;

export const proseStories: Story<ProseModel, TerminalExt, GuiExt>[] = [
  {
    component: "prose",
    state: "blocks",
    about: "A text of several blocks: paragraphs, a list, a table, code and a quote",
    settings: "prose({text, width})",
    model: { text: ISSUE },
    ext: { terminal: { extreme: true, ...DIALOG } },
  },
  {
    component: "prose",
    state: "window",
    about: "A room too short shows a window: the rows at its edges count what is past them",
    settings: "scrolled(prose({text, width}), {rows: 8, top: 2})",
    model: { text: ISSUE },
    ext: { terminal: { ...DIALOG, window: { rows: 8, top: 2 } } },
  },
  {
    component: "prose",
    state: "quiet",
    about: "Every word quiet: a text beside the main one",
    settings: "prose({text, width, isDim: true})",
    model: { text: "Filed from `acme/sync-worker` on **fix/retry-after**.", isDim: true },
    ext: { terminal: DIALOG },
  },
  {
    component: "prose",
    state: "excerpt",
    about: "A passage that gives way to what follows it: drawn whole in a terminal",
    settings: "prose({text, width, excerpt: {hit, isOpen}})",
    model: { text: PASSAGE, excerpt: { hit: "more", isOpen: false } },
    ext: { terminal: DIALOG },
  },
  {
    component: "prose",
    state: "opened",
    about: "The same passage opened: the whole of it in a panel, with Less",
    settings: "prose({text, width, excerpt: {hit, isOpen: true}})",
    model: { text: PASSAGE, excerpt: { hit: "more", isOpen: true } },
    ext: { terminal: DIALOG },
  },
];
