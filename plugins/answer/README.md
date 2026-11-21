---
tagline: "Answer a round of questions in the chat, add notes, and send the answers you have."
featured: true
order: 4
---

When a turn ends with numbered questions, click a choice, write your own answer, or add a note. You can leave questions unanswered. **Fill prompt** puts the reply above your draft. **Send reply**, where available, sends it without disturbing the draft.

If you send a different message, run `/answer` to reopen the round. Submitted rounds stay visible in the current transcript with a **Sent** marker.

## Terminal

Question cards appear in the transcript. In pi a numbered pick list is cards too. In pi's regular terminal mode the keys below work, but not the mouse, and you scroll to a card yourself. In Claude Code, the classic renderer and numbered pick lists use a guided form above the prompt; open it with `/answer`.

Focus the fullscreen card controls before using the keys below: in Claude Code press `Ctrl+x Tab` or bind `Alt+a`; in pi press `Alt+a` or run `/answer`.

| Key               | Action                                                 |
| ----------------- | ------------------------------------------------------ |
| Option letter     | Pick a row, including write-in (pi allows row numbers) |
| `j`, `k`          | Move between questions or review rows                  |
| `n`               | Add or edit a note                                     |
| `r`               | Open review or return to the question                  |
| `Enter` in review | Open the selected question or activate **Fill prompt** |
| `f`               | Fill the prompt without sending                        |
| `s` in pi         | Send the answers you have                              |

Open the review with **Show all questions** in Claude Code or **Show questions** in pi. **Clear answer** removes a choice without clearing its note. In the editor, `Shift+Enter` adds a line and `Enter` saves. In Claude Code, click the field or focus the band before typing. In pi, `Esc` cancels editing; a click on the prompt gives it focus.

To add the optional Claude Code binding, merge this entry into `~/.claude/keybindings.json`:

```json
{
  "bindings": [{ "context": "Chat", "bindings": { "alt+a": "abovePrompt:focus" } }]
}
```

## VS Code and Desktop

In VS Code, use **Add line** to add a line to a note or write-in, then **Save** or **Cancel**. The footer offers **Fill prompt** and **Send reply**. In Desktop, click **Review answers** and pick a question number to go back to its card.
