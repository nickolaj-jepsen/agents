---
tagline: "A form for the round of questions or numbered pick list a turn ended on, which writes your reply into the prompt."
featured: true
requires: []
order: 4
---

A form for the round of questions or numbered pick list a turn ended on, which
writes your reply into the prompt.

- A row above the prompt offers the form when a turn ends on questions; `/answer`
  or a click opens it.
- One question per screen: numbered options, plus a last entry to write your own.
- Answer with a number, `Enter` or a click, and add a note under any answer.
- `y` takes the recommendation, `m` picks several options (`Q3: A, C`).
- `h` / `l` / `s` / `r`: back, next, skip, review.
- The review writes one line per answer into the prompt, above any draft. You send
  it.
- Works with the mouse alone, and in the desktop app, VS Code and mobile with their
  own controls.
- Answers last the session: a turn a background task starts keeps them, your own
  send drops them.
- pi has the same form from the same parser (`core/forms.ts`), as its own pi package
  (`pi/`): the same keys, a double click goes on to the next question, and the form
  stands as tall as its tallest question so stepping moves nothing.

Keys, in `~/.claude/keybindings.json` (a mod can't take the keyboard itself):

```json
{
  "bindings": [
    { "context": "Chat", "bindings": { "alt+a": "abovePrompt:focus" } },
    {
      "context": "AbovePrompt",
      "bindings": { "j": "abovePrompt:next", "k": "abovePrompt:previous" }
    },
    {
      "context": "AbovePromptInput",
      "bindings": { "escape": "abovePrompt:previous" }
    }
  ]
}
```

- `alt+a` lands on the offer row, and `Enter` opens the form.
- `Esc` in a field steps back onto the form instead of out to the prompt.

Options (`claude plugin configure answer`):

- `scrollTranscript` (off): leave a question's body out of the form and scroll the
  transcript to it instead.

An open form takes the band above the prompt to itself; the other plugins' rows come back
when it closes.
