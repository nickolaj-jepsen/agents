---
tagline: "Answer a round of questions in the chat, add notes, and send the answers you have."
featured: true
order: 4
---

When a turn ends with questions, click a choice, write your own answer, or add a note. You can leave questions unanswered. **Fill prompt** puts the reply above your draft. **Send reply**, where available, sends it without disturbing the draft.

What counts as a question:

- Numbered questions: `**Q1. …?**`, `Question 2:`, `## Q3 — …`, or a numbered list that holds a question mark, options or a recommendation, or sits under a line such as "Decisions for you:".
- One question with lettered options and a closing question, or a recommendation, or a question followed by "Recommended:" or "My recommended answer:". The reply is the answer alone, such as `B` or `yes`.
- A list of alternatives followed by "Which do you want?", or under "Want me to:". It is one card whose rows keep the list's numbers; to pick several, write them in the write-in.
- A pick list whose rows end in `build`, `/grill-me` or `/brainstorm`.

A numbered list of steps or findings is not a round, and neither is a lone "Want me to…?" or a closing "Have we reached a shared understanding?": answer those in the prompt. Whatever the message says after its last question stays visible after the cards.

If you send a different message, run `/answer` to reopen the round. Submitted rounds stay visible in the current transcript with a **Sent** marker.

## Terminal

Every round, a numbered pick list included, appears as cards in the transcript. Click an answer to pick it; click the chosen one again to take it back. A pick list's rows are lettered by place, with **Something else** last.

To use the keys below, give the cards the keyboard first: in Claude Code press `Ctrl+x Tab` or bind `Alt+a`; in pi press `Alt+a` or run `/answer`.

| Key                        | Action                                                           |
| -------------------------- | ---------------------------------------------------------------- |
| Option letter              | Pick a row, including write-in (pi allows row numbers)           |
| `j`, `k`                   | Move between the questions and the closing row after them        |
| `n`                        | Add or edit a note; on the closing row, the round's note         |
| `r`                        | Go to the closing row or back to the question                    |
| `Enter` on the closing row | Fill the prompt; with nothing answered, go to the first question |
| `f`                        | Fill the prompt without sending                                  |
| `x` in pi                  | Clear the answer and keep its note                               |
| `s` in pi                  | Send the answers you have                                        |

The row after the last card counts the answered questions. Click the count to go back to the first question, or **Fill prompt** to put the reply in the prompt. A card with an answer has a green rail.

In the editor, `Shift+Enter` adds a line and `Enter` saves. In Claude Code, click the field or focus the band before typing. In pi, `Esc` cancels editing; a click on the prompt gives it focus.

The cards are made for each client's fullscreen renderer, which is the default. pi's regular terminal mode takes keys only: the terminal owns the scrollback there, so the mouse does nothing on a card and you scroll to it yourself. Claude Code's classic renderer is not supported. In Claude Code, `/answer` brings the current card into view.

To add the optional Claude Code binding, merge this entry into `~/.claude/keybindings.json`:

```json
{
  "bindings": [{ "context": "Chat", "bindings": { "alt+a": "abovePrompt:focus" } }]
}
```

## VS Code and Desktop

In VS Code, use **Add line** to add a line to a note or write-in, then **Save** or **Cancel**. The footer offers **Fill prompt** and **Send reply**. In Desktop, click **Review answers** and pick a question number to go back to its card.
