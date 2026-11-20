---
tagline: "Answer a round of questions in the chat, add notes, and send the answers you have."
featured: true
order: 4
---

When Claude ends a turn with numbered questions, each gets a card in the
transcript. Picking an option leaves that card active so you can add a note.

**Fill prompt** puts the reply above any text you've already typed.
Where **Send reply** is available, it sends the answers you have and keeps
your prompt draft. You can leave questions unanswered.

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
| `f`      | Fill the prompt without sending                             |

The write-in gets the next letter after the printed choices. Click the write-in
or **Add a note** to open its editor. **Clear answer** appears below the choices and above the note.
It removes the answer without clearing the note.

The editor opens above the prompt without taking focus. Click the field or press
`Alt+a` (or `ctrl+x tab`) before typing or pasting. Use `Shift+Enter` for a
new line and `Enter` to save. If you press `Enter` in the prompt without
focusing the field, the first send is blocked and your draft stays in place.

Click **Show all questions** or press `r` to expand **Answers**. With the
controls focused, `Enter` uses **Fill prompt**, which starts selected. Use
`j` and `k` to pick a question, then press `Enter` to return to its card.
**Fill prompt** returns focus to the prompt.

Bind `Alt+a` in `~/.claude/keybindings.json` to give the control bar the keys.
The built-in `ctrl+x tab` focuses the band too, and needs no binding.

```json
{
  "bindings": [{ "context": "Chat", "bindings": { "alt+a": "abovePrompt:focus" } }]
}
```

## VS Code and Desktop

The questions stay in the transcript. In VS Code, choose an option or write
your own answer on its card. Add notes there too, without changing your chat
draft. Use **Add line** for another line, then **Save** or **Cancel**.
The footer shows how many you've answered and lets you fill the prompt or
send the reply directly, without a separate review.

In Desktop, open **Review answers** below the last card. Select a question
number in the review to go back to that card.

## pi

In fullscreen, question cards and their review appear below the assistant's
message. Click a choice to save it. Click the **Note** line or your write-in
choice to turn that line into an editor. `Enter` saves, `Shift+Enter` adds a line,
and `Esc` cancels. Your prompt draft stays in place.

Press `Alt+a` or run `/answer` to give the key guide focus. Use the letters
printed on a card to choose, `j` and `k` to move, `n` to edit a note, and `r`
to switch between a question and the review. `Esc` or a click on the prompt
returns focus there.

The **Answers** box shows your progress. Click **Show questions** to expand it,
or press `j` from the last question. In review, use `j` and `k` to move between
rows, and `Enter` to open the selected question or activate **Fill prompt**.
Press `k` from the first stop to return to the last question. You can also click
**Hide questions** to collapse the box. Press `f` to fill the prompt without
sending, or `s` to send the reply.

Regular terminal mode and numbered pick lists use the guided form above the
prompt. Open it with `/answer` or `Alt+a`. To use this form for fullscreen
question rounds too, start pi with `--answer-guided`.

Numbered pick lists in Claude Code also use the guided form. Open it with
`/answer` or click its offer.
