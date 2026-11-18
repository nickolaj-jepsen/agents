---
tagline: "A form for the round of questions or numbered pick list a turn ended on, which writes your reply into the prompt and keeps your answers when a send sets it aside."
featured: true
requires: []
order: 4
---

- A row above the prompt offers the form when a turn ends on questions; `/answer`
  or a click opens it.
- One question per screen. Each option is keyed by the letter the message gave it
  (`a`, `b`, `c`), plus a last entry to write your own (`w`); a pick list's rows are
  numbered instead. The back key is `h`, so an option H is reached by the ring or a
  click.
- Its letter, `Enter` or a click takes an answer, and the form goes on to the next
  question; the last one lands on the review. A note is `n`, or a click on `add a note`
  under the answer.
- `y` takes the recommendation (`y: take B`); `m` picks several options (`Q3: A, C`).
- `h` / `l` / `s` / `r`: back, next, skip, review. `↑` / `↓` / `Tab` move between answers.
- The review lists each question with its answer, and the reply below it. `fill the
  prompt` writes the reply into the prompt, above any draft, for you to send. `s`
  sends it at once as your message, and leaves your draft where it was. A send that
  fails keeps the answers in the form.
- Every row, key and button takes a click, so the mouse alone works.
- In the desktop app and VS Code the form is drawn with the host's own controls, not
  the terminal's rows. The offer is a status line with an `Answer` button. The form's
  top line has a tab per question (`✓ Q1` once answered) and the review, the current
  one filled, and `Close`. Under the question and the first line of its body (`More`
  opens the rest), each option is one line: a button of its letter, its words and its
  detail beside it, so three options, the write-in and the keys fit the band. The last
  row is a field to write your own answer; a click lands in it and Enter keeps it. A
  chosen option opens in place: its words whole, a field for a note, and `Next`
  (`Review` on the last one). `Skip`, `Pick several`, `Add note` and, for a
  recommendation of several options, `Take A, B, C` are quiet buttons at the foot. The
  review lists each answer beside its question, a field for a note on the whole round,
  and `Send`, filled once something is answered, with `Fill the prompt` beside it.
- Answers last the session: a turn a background task starts keeps them, your own
  send sets the round aside, and sending the reply itself just closes it. A round set
  aside comes back with `/answer`, answers and all (pi: `alt+a` or `/answer`).
- pi has the same form from the same parser (`core/forms.ts`), as its own pi package
  (`pi/`). It takes the same keys, and the form stands as tall as its tallest question,
  so stepping moves nothing.
- In pi the form is a widget above the prompt, which stays shown. `alt+a` or a click on
  the form gives it the keys, and a click on the prompt gives them back; `Esc` closes
  it. Closed, it is one row, `Answer 4 questions · alt+a or /answer`, which a click
  opens; the question stops in the form's top border are clickable too.

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
