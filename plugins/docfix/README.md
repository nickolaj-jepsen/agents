---
tagline: "Agents file doc suggestions instead of editing docs outside their change; you review them and hand the ones you want back to the agent."
featured: true
status: in-progress
requires:
  - "A git repository with a note store (`.agents/store`, `agent-notes root --ensure`)"
order: 7
---

Use `/docfix` to review suggestions for tracked Markdown files. Suggestions live in the shared `.agents/store/docfix/` directory, so every worktree sees the same queue. Repeat reports increase the seen count. Claude Code shows the count above the prompt; pi shows it in the footer.

1. Open a row to read its claim and evidence: click it, or press `Enter` in Claude Code or `Space` in pi.
2. Set a row to **Apply** (`a`), **Dismiss** (`d`) or **Skip** (`s`, the default). In pi, applying a key to a doc header sets all its rows.
3. Submit or close the pane to carry out your choices. `Esc` also submits in both harnesses; in pi, so does `Enter`. Set any rows you don't want to act on back to **Skip** before closing.

**Apply** puts a prompt in your draft without sending it. Review and send it to have the agent verify the claim, edit the docs and resolve the suggestion. **Dismiss** keeps the report but suppresses repeats. If the draft can't be inserted, the pane stays open with your choices intact.

Agents file suggestions only when they find evidence in the current session. Reading a doc can show a reminder, but it doesn't file anything. Docs that cover code the agent is already changing should still be updated with that change.
