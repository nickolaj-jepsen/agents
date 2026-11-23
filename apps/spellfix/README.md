---
tagline: "Picks fixes for misspelled words in the prompt draft with hunspell and Haiku."
featured: true
requires:
  - "`hunspell` and its dictionaries"
order: 3
---

One Haiku call answers every flagged word, and adds the ones it calls correct to
the personal word list. It also finds real-word typos hunspell can't (`form` for
`from`).

## Claude Code

In the terminal, use the picker above the prompt. To open it from any draft,
bind `app:toggleDiffNoiseFilter` in the `Global` context of
`~/.claude/keybindings.json` (for example, to `ctrl+q`).

In Desktop or VS Code, click **Review** to pick a suggestion in context, skip
it, or use **Fix all**. Fix all can be undone from its confirmation. **Add
word** needs a personal dictionary. In VS Code the band doesn't follow typing:
it updates when a turn starts or ends, or when the prompt box changes width.
The picker there is mouse-only.

```bash
claude plugin list                                # find the installed plugin ID
claude plugin configure spellfix@nickolaj-jepsen    # inspect defaults and change settings
```

## pi

Spellfix runs in the session you started, not in subagents.

- `ctrl+q`, `/spellfix` or `/spellcheck` opens the draft as a review: one row per
  decision, each the word as written and its replacement in green. The sheet stands
  on the rule over your prompt, so the draft it is reviewing stays in sight.
- `space` toggles a row, `a` writes the checked ones into the draft and closes,
  `enter` applies just the focused one, `esc` changes nothing. `↑`/`↓` (or `j`/`k`)
  move, `PageUp`/`PageDown` move a window, and `Home`/`End` jump to the ends; the
  window says how many findings are hidden.
- Click a row to focus it, its mark to toggle it, or a button to act. **Close ×**
  in the top rule leaves the draft as it was.
- `d` keeps a word by adding it to the personal dictionary, `u` takes back the
  words this answer added, and `/spellfix undo` takes the last answer's adds back
  once the review is closed.
- A large paste stays its `[paste #n]` marker, and a draft that starts with `!`
  (a shell command) is not checked.

With pi's stock editor, use the commands or shortcut to open the review. Inline underlines and automatic rechecks need an editor that publishes itself on pi's event bus.

Configuration is in the environment, so a pi install sets it once:

- `PI_SPELLFIX_HUNSPELL` (`hunspell`): the executable.
- `PI_SPELLFIX_DICTS` (`en_US`): hunspell's `-d`, comma-separated.
- `PI_SPELLFIX_PERSONAL` (none): the personal word list, shared with the Claude
  Code mod, so a word learned in one is known to the other.
- `PI_SPELLFIX_MODEL` (`anthropic/claude-haiku-5-5`): the model the review asks,
  as `provider/model`.
