---
tagline: "Answer a round of questions in the chat, add notes, and send the answers you have."
featured: true
requires: []
order: 4
---

When Claude ends a turn with numbered questions, each gets a card in the
transcript. Picking an option leaves that card active so you can add a note.

The review follows the last question and updates as you answer. **Fill prompt**
puts the reply above any text you've already typed. **Send reply** sends the
answers you have and keeps your prompt draft. You can leave questions unanswered.

If you send a different message, `/answer` brings back the round and its draft.
A submitted round stays visible in the current chat with its saved answers
and a **Sent** marker.

## Claude Code Terminal

In fullscreen, run `/answer` to show the active card, marked with `❯`. Click a
choice, or press `Alt+a` to give the key guide the keys and use shortcuts. The
classic renderer uses the guided form.

| Key      | Action                                                      |
| -------- | ----------------------------------------------------------- |
| Letter   | Pick a choice or open its write-in field                    |
| `j`, `k` | Move to the next or previous card                           |
| `n`      | Write or edit a note                                        |
| `r`      | Open review or go back to the question                      |
| `Enter`  | In review, open the highlighted question or fill the prompt |

The write-in gets the next letter after the printed choices. Click the write-in
or **Add a note** to open its editor. **Clear answer** appears below the choices and above the note.
It removes the answer without clearing the note.

The editor appears above the prompt without taking keyboard focus. Click inside
its field or press `Alt+a` (or `ctrl+x tab`) to start typing. If you press `Enter`
in the prompt before focusing the field, the first send is blocked and your draft
stays in place. `Fill prompt` also returns the keys to the
prompt, and the guide goes back to saying `alt+a`.

The **Answers** summary below the last question shows how many you’ve answered.
**Fill prompt** copies your answers into the prompt without sending them.
Click **Show all questions** or press `r` to expand the summary.
In the expanded summary, press `Alt+a` to focus the controls, then `Enter`
to use **Fill prompt**, which starts selected. Use `j` and `k` to move
through the list, or press `f` to fill from any question.
Click a question or press `Enter` on it to jump to its card. Reopening the
summary takes you back to that question.

The editor sits above the prompt and keeps the question in view. After the
guide has the keys, typed keys and pasted text reach the field. `Shift+Enter`
adds a line and `Enter` saves. Saving or cancelling leaves your prompt draft
alone.

Bind `Alt+a` in `~/.claude/keybindings.json` to give the control bar the keys.
The built-in `ctrl+x tab` focuses the band too, and needs no binding.

```json
{
  "bindings": [{ "context": "Chat", "bindings": { "alt+a": "abovePrompt:focus" } }]
}
```

## VS Code and Desktop

Use the controls on the transcript cards and scroll between questions. In
VS Code, **Write longer note** uses the main composer for multiline notes.
**Save note** or **Cancel note** returns any text you already had in the composer.

## pi

In fullscreen, question cards and their review appear below the assistant's
message. Click a choice to save it. Click **Add a note** or the write-in to open
a multiline editor. `Enter` saves, `Shift+Enter` adds a line, and `Esc` cancels.
Your prompt draft stays in place.

Press `Alt+a` or run `/answer` to give the key guide focus. Use the letters
printed on a card to choose, `j` and `k` to move, `n` to edit a note, and `r`
to switch between a question and the review. `Esc` or a click on the prompt
returns focus there. In review, `Enter` fills the prompt and `s` sends the reply.

Regular terminal mode and numbered pick lists use the guided form above the
prompt. Open it with `/answer` or `Alt+a`. To use this form for fullscreen
question rounds too, start pi with `--answer-guided`.

Numbered pick lists in Claude Code also use the guided form. Open it with
`/answer` or click its offer.
