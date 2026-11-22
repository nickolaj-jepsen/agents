---
tagline: "An `ask_user_question` tool: one to four multiple-choice questions in a dialog, which come back to the model as answers."
featured: true
order: 5
---

When pi calls `ask_user_question`, pick an option, write your own answer, or add a note. The form pauses the turn without changing your composer draft.

| Key                           | Action                                                 |
| ----------------------------- | ------------------------------------------------------ |
| Letter, row number or `Enter` | Choose an option or open its write-in                  |
| `Space` or `Enter`            | Toggle a choice in a multi-select; press `s` when done |
| `↑`, `↓` or `j`, `k`          | Move between options                                   |
| `Tab`, `←` or `→`             | Switch steps                                           |
| `n`                           | Add a note                                             |
| `Shift+↑` / `Shift+↓`         | Scroll the preview or review                           |
| `Shift+←` / `Shift+→`         | Scroll a long question                                 |

Click a header step to jump to it. In **Review**, click an answer or press its step number to edit it, then choose **Send**. **Close** (or `Esc` outside a text field) offers **Discard** and **Keep** in the header.

The tool isn't loaded in subagents. Outside the terminal, it uses the host's select and input prompts. For questions the agent wrote in chat, use [Answer](../answer/README.md) instead.
