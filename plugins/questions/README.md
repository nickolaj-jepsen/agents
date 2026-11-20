---
tagline: "An `ask_user_question` tool: one to four multiple-choice questions in a dialog, which come back to the model as answers."
featured: true
requires: []
order: 5
---

pi only, session you started only. `ask_user_question` puts a decision the
model cannot make alone to you as a form: one to four questions, each with two
to four options, and the answers come back to it as data instead of a
conversation.

The framed form replaces the composer until you submit or cancel. When the
composer returns, its draft is still there.

- Press the printed letter or its row number to pick a choice or open the
  write-in. Use `↑` / `↓` or `j` / `k` to move and `Enter` to select.
- In a multi-select question, `Space` toggles a focused choice. Select
  **Done** when you have finished picking or writing.
- Use `n` or click **Add a note** to add a note. Use `Tab` or `←` / `→` to
  switch questions. With more than one question, the **Review** tab shows
  every answer before you submit it.
- A highlighted option’s Markdown preview appears beside the choices, or
  below them on a narrow terminal. `Shift+↑` / `Shift+↓` scrolls the preview;
  `Shift+←` / `Shift+→` scrolls a long question.
- `Esc` asks before cancelling. Submit returns the answers to the model
  as tool data, not as a chat message.

[Answer](../answer/README.md) handles a different case: questions the model
wrote in its message rather than asking through this tool.

Outside a terminal (a JSON, print or RPC host) the same questions are walked
through the host's own `select` and `input` prompts.
