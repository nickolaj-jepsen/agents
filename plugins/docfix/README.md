---
tagline: "Agents file doc suggestions instead of editing docs outside their change; you review them and hand the ones you want back to the agent."
featured: true
status: in-progress
requires:
  - "A git repository with a note store (`.agents/store`, `agent-notes root --ensure`)"
order: 7
---

- A `docfix` tool the model always sees. It files a suggestion when a doc it
  happens on doesn't match reality: it contradicts the code, misses a trap the
  agent just hit, or describes something gone or finished. A doc covering the
  code an agent is changing is still updated in that change. A suggestion needs
  proof the agent saw in the session (a line it read, a command's output), never
  a hunch.
- The first time a session reads a tracked doc (the read tool, or `cat`, `sed`,
  `head` and the like in a shell), one line after the result names the tool.
  It files nothing itself: the agent still decides, and needs the same proof.
- Targets are git-tracked Markdown files in the repo. Each suggestion is one
  Markdown file in the checkout's note store (`.agents/store/docfix/`), which
  every worktree of the repo shares.
- A repeat bumps the existing suggestion's seen count instead of adding one; the
  tool's result says `seen N×` in the transcript, and the status line shows
  `docs N` while any are open.
- `/docfix` lists the open ones by doc, each claim and its evidence shown whole:
  nothing is cut, and in pi a long detail scrolls. Mark several (Enter or a click
  on a row, a doc's header marks all of it, `m` marks everything), then **Apply**:
  one prompt, drafted in your prompt box and not sent, names them by id and asks
  the agent to check each claim, edit the doc as it stands now, and resolve the
  suggestion. The evidence stays in the suggestion's file for the agent to read.
  Nothing is committed. **Dismiss** keeps the suggestion, so the same claim isn't
  filed again, and `u` opens the last dismissed ones again.
- pi has the same tool, panel and footer count from the same core
  (`core/docfix.ts`), subagents included.

Claude Code ships `/docs`, so the command is `/docfix` in both.
