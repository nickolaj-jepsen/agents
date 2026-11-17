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
- One question per screen: each option is keyed by the letter the message gave it (`a`, `b`, `c`), plus a last entry to write your own (`w`). A pick list's rows are numbered; the back key is `h`, so an option H is reached by the ring or a click.
- An answer (its letter, `Enter` or a click) is taken and the form goes on to the next
  question; the last one lands on the review. A note is `n`, or a click on `add a note`
  under the answer.
- `y` takes the recommendation (`y: take B`), `m` picks several options (`Q3: A, C`).
- `h` / `l` / `s` / `r`: back, next, skip, review. `↑` / `↓` / `Tab` move between answers.
- The review lists each question with its answer, and the reply below it. `fill the
  prompt` writes the reply into the prompt, above any draft, for you to send; `s`
  sends it at once as your message and leaves your draft where it was.
- Works with the mouse alone, and in the desktop app, VS Code and mobile with their
  own controls.
- Answers last the session: a turn a background task starts keeps them, your own
  send drops them.
- pi has the same form from the same parser (`core/forms.ts`), as its own pi package
  (`pi/`): the same keys, and the form stands as tall as its tallest question so
  stepping moves nothing.

An open form takes the band above the prompt to itself; the other plugins' rows come back
when it closes.

## Keys

In `~/.claude/keybindings.json` (a mod can't take the keyboard itself):

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
- A mod can't bind `Esc` or `←` / `→` to close the form or change question; `q`, `h` and `l` do.
