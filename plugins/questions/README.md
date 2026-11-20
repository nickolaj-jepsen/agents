---
tagline: "An `ask_user_question` tool: one to four multiple-choice questions in a dialog, which come back to the model as answers."
featured: true
order: 5
---

When the agent calls `ask_user_question`, answer, write your own choice, or add a note. With multiple questions, review the answers before submitting. Submitting none is treated as cancellation.

| Key                     | Action                                                |
| ----------------------- | ----------------------------------------------------- |
| `↑`, `↓` or `j`, `k`    | Move between options                                  |
| `Enter` or a row number | Pick an option; use **Done** to finish a multi-select |
| `Space`                 | Toggle the focused option in a multi-select           |
| `Tab`, `←`, `→`         | Switch question or review tab                         |
| `n`                     | Add a note                                            |
| `Shift+↓`               | Scroll a long option or preview                       |
| `Esc`                   | Cancel the questionnaire                              |

The tool pauses the turn for answers. For questions the agent wrote in chat at the end of a turn, use [answer](../answer/README.md) instead. The tool isn't loaded in subagents. Outside the terminal, it uses the host's select and input prompts.
