---
tagline: "Agents file doc suggestions instead of editing docs outside their change; you review them and hand the ones you want back to the agent."
featured: true
status: in-progress
requires:
  - "A git repository with a note store (`.agents/store`, `agent-notes root --ensure`)"
order: 7
---

## What it files

- A `docfix` tool the model always sees. It files a suggestion when a doc it
  happens on doesn't match reality: it contradicts the code, misses a trap the
  agent just hit, or describes something gone or finished.
  - A doc covering the code an agent is changing is still updated in that change.
  - A suggestion needs proof the agent saw in the session, such as a line it read
    or a command's output. Never a hunch.
- The first time a session reads a tracked doc (the read tool, or `cat`, `sed`,
  `head` and the like in a shell), one line after the result names the tool. It
  files nothing itself: the agent still decides, and needs the same proof.
- Targets are git-tracked Markdown files in the repo. Each suggestion is one
  Markdown file in the checkout's note store (`.agents/store/docfix/`), which
  every worktree of the repo shares.
- A repeat bumps the existing suggestion's seen count instead of adding one. The
  tool's result says `seen N×` in the transcript, and the status line shows
  `docs N` while any are open.

## Reviewing them

- `/docfix` lists the open ones by doc. Each claim and its evidence are shown
  whole: nothing is cut, and in pi a long detail scrolls.
- Mark several with `Enter` (in pi, `space`) or a click on a row. A doc's header
  marks all of it, and `m` marks everything.
- **Apply** drafts one prompt in your prompt box, not sent. It lists each claim
  under its doc, with the file that holds its evidence, and asks the agent to
  check the claim against the code, edit the doc as it stands now, and resolve
  the suggestion. The evidence stays in its file for the agent to read. Nothing
  is committed.
  - Where the same fact stands in a doc beside it (its folder, skill or
    plugin), the agent fixes it there too and names that doc. It doesn't file a
    second suggestion, and it searches only for that fact, so the apply doesn't
    turn into a review of every doc.
- **Dismiss** keeps the suggestion, so the same claim isn't filed again. `u` opens
  the last dismissed ones again.

pi has the same tool, panel and footer count from the same core (`core/docfix.ts`),
subagents included. Claude Code ships `/docs`, so the command is `/docfix` in both.
