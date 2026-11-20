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
composer returns, its draft is still there. Click the action below the answers
or press the key next to it (`↵` means Enter).

- Press the printed letter or its row number to pick a choice or open the
  write-in. Use `↑` / `↓` or `j` / `k` to move and `Enter` to select.
- In a multi-select question, `Space` or `Enter` toggles the focused choice.
  When you’re done picking or writing, press `s` or click **Send**. In a
  round with several questions, click **Continue** instead.
- Use `n` or click **Add a note** to add a note. Click a step in the header
  or use `Tab` or `←` / `→` to switch steps.
- For rounds with several questions, **Review** shows the answers and notes
  before you send them. Click an answer or press its step number to edit it.
  Press `Enter` to send when every question is answered.
- A highlighted option’s Markdown preview appears beside the choices, or
  below them on a narrow terminal. `Shift+↑` / `Shift+↓` scrolls the preview;
  `Shift+←` / `Shift+→` scrolls a long question.
- **Close** (or **×** on a narrow terminal) changes into **Discard ↵** and
  **Keep [esc]** in the upper-right corner. `Esc` opens the same confirmation,
  or leaves the field if you’re typing. Sending returns the answers to the
  model as tool data, not as a chat message.

[Answer](../answer/README.md) handles a different case: questions the model
wrote in its message rather than asking through this tool.

Outside a terminal (a JSON, print or RPC host) the same questions are walked
through the host's own `select` and `input` prompts.
