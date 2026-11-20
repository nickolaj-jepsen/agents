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

A click in the transcript gives the keyboard back to the prompt, and Claude does
not give the band the keys from a click. So the band does not open a field the
prompt would take the typing from: it shows the handoff instead, `Note · Q1 …
Alt+a, then Enter, writes it`. Press `Alt+a` (or `ctrl+x tab`), then `Enter`.
Until then the guide says `alt+a for the keys` rather than listing letters it
cannot hear. The first `Enter` on the prompt while a handoff waits is kept back,
with your draft left in place. `Fill prompt` also returns the keys to the
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

## Numbered pick lists and pi

Numbered pick lists in Claude and question rounds in pi use the guided form
above the prompt. Open it with `/answer` or click its offer. In pi, `Alt+a`
focuses the form and `Esc` closes it.
