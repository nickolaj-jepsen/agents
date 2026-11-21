---
tagline: "Agents file doc suggestions instead of editing docs outside their change; you review them and hand the ones you want back to the agent."
featured: true
status: in-progress
requires:
  - "A git repository with a note store (`.agents/store`, `agent-notes root --ensure`)"
order: 7
---

Use `/docfix` to review suggestions for tracked Markdown files. Suggestions live in the shared `.agents/store/docfix/` directory, so every worktree sees the same queue. Repeat reports increase the seen count. Claude Code shows the count above the prompt; pi shows it in the footer.

In the terminal, `/docfix` opens a sidebar on the right: the queue grouped by doc, and under it the suggestion the keyboard is on, with its newest evidence.

1. Move with `↑`/`↓` (or `j`/`k`), or click a row.
2. Press `a` to **Apply** a suggestion or `d` to **Dismiss** it; the keyboard moves on to the next one left alone. The same key again leaves it alone. In pi, `A` and `D` set every suggestion of the doc.
3. Press `e`, or click the suggestion under the queue, to read all its evidence; `n` shows the next piece and `Esc` goes back.
4. Press `Enter` for the main action, which says what it will do: `Draft 2 fixes, dismiss 1`. Close (`Esc` or `Close ×`) asks before it throws your choices away.

In Claude Code, the pane has the keyboard after `/docfix`, a click in it or `ctrl+x tab`; a line under it says so when it doesn't. Desktop and VS Code show the queue as a pane of their own, where each row opens in place and closing the pane carries out your choices.

**Apply** puts a prompt in your draft without sending it. Review and send it to have the agent verify the claim, edit the docs and resolve the suggestion. **Dismiss** keeps the report but suppresses repeats. If the draft can't be inserted, the sidebar stays open with your choices intact.

Agents file suggestions only when they find evidence in the current session. Reading a doc can show a reminder, but it doesn't file anything. Docs that cover code the agent is already changing should still be updated with that change.
