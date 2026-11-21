---
tagline: "Turns a thought, or something Claude Code flagged, into a Linear issue you approve before it's filed."
featured: true
requires:
  - "A Linear MCP server, connected and signed in"
order: 1
---

Run `/linear [what to file]` to review a draft. Omit the note to draft from the recent conversation. In Claude Code you can also draft from a **You should know** card: open **Learn more**, then choose **Linear issue** (usually `3` in the terminal).

The draft opens in a pane in Claude Code and in a sheet on the bottom edge in pi. Both terminals take the same keys. Only `Enter` ever sends anything to Linear.

| Key                 | What it does                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Enter`             | Create the issue. When an open issue may already cover the problem, the button reads **Create…** and `Enter` first shows that issue with two answers: comment on it instead, or create the new one anyway. `Enter` there sends the one you chose. |
| `o`                 | Tick **Then open in Linear** to open the issue in the browser once it is filed. The choice is remembered.                                                                                                                                         |
| `e`                 | Edit the title. `Enter` saves it.                                                                                                                                                                                                                 |
| `t` `s` `p` `l` `j` | Open the team, status, priority, labels or project under its row. Pick with a choice's letter, or move with the arrows and press `Enter`. Labels stay open while you tick them; `Enter` closes them.                                              |
| `↑` `↓`             | Scroll the description.                                                                                                                                                                                                                           |
| `d`                 | Discard the draft. It asks first.                                                                                                                                                                                                                 |
| `Esc`               | Put the draft aside. It stays as a line above the prompt.                                                                                                                                                                                         |

Every row and button also takes a click. An `Enter` pressed in the first moment after the draft appears is ignored, so one meant for the prompt files nothing.

Claude Code's pane takes no `Esc` or `Space` of its own. There `0` goes back from a list of choices, `1` ticks the label under the pointer, and `Esc` then an arrow leaves the title's field without saving.

To bring a draft back, run `/linear` again. In Claude Code's terminal `8` also reopens it and `9` twice discards it.

In Claude Desktop and VS Code, use **Edit** to change the fields, open the suggested issue and choose **Comment instead** to comment, and use the **Open** and **Discard** buttons for a draft put aside.

pi drafts with the session's model and reaches Linear through the servers named like `linear` in `mcp.json`. Sign in once with `/mcp`.
