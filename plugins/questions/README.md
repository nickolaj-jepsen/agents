---
tagline: "An `ask_user_question` tool: one to four multiple-choice questions in a dialog, which come back to the model as answers."
featured: true
order: 5
---

pi only, session you started only. `ask_user_question` puts a decision the
model cannot make alone to you as a form: one to four questions, each with two
to four options, and the answers come back to it as data instead of a
conversation.

- One tab per question, and a review tab when there is more than one. Every
  question has a last row to type your own answer, and a note beside any
  answer.
- `↑` / `↓` or `j` / `k` move; `enter` takes the focused row; a digit takes the
  row it numbers. `space` toggles an option on a multi-select question, whose
  last row is `Done`.
- `tab` / `←` / `→` move between tabs, `n` adds a note, `shift+↓` scrolls a
  long option or its preview, `esc` cancels the whole questionnaire.
- The review tab lists every answer with the reply, and `enter` sends it. An
  option's `preview` (markdown) is shown beside the options while it is
  highlighted, and under them on a narrow terminal.
- Answering none of the questions is an answer the model is told to read as a
  cancel, not as a decision.

It is a tool, not a form for the prompt: it waits while you answer, and the
session shows nothing else meanwhile. `answer` is the other direction — a
question round a turn ended on, which you fill in after the turn — and the two
work side by side in a session.

Outside a terminal (a JSON, print or RPC host) the same questions are walked
through the host's own `select` and `input` prompts.
