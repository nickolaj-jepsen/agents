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
word** needs a personal dictionary. In VS Code the band can lag behind typing
and the picker is mouse-only.

`claude plugin configure spellfix@nickolaj-jepsen` shows the defaults and your
settings. Use the ID from `claude plugin list` if you installed it under another
name.

## pi

Spellfix runs in the session you started, not in subagents.

- `ctrl+q`, `/spellfix` or `/spellcheck` opens the draft as a review: one row per
  decision, each the word struck out and its replacement in green.
- `space` toggles a row, `a` writes the checked ones into the draft and closes,
  `enter` applies just the focused one, `esc` changes nothing.
- `d` keeps a word by adding it to the personal dictionary, `u` takes back the
  words this answer added, and `/spellfix undo` takes the last answer's adds back
  once the review is closed.
- A large paste stays its `[paste #n]` marker, and a draft that starts with `!`
  (a shell command) is not checked.

The underline and the automatic recheck need an editor that publishes itself on
pi's event bus, which the house editor in the system config does; under pi's
stock editor the commands, the shortcut and the review still work, without them.

Configuration is in the environment, so a pi install sets it once:

- `PI_SPELLFIX_HUNSPELL` (`hunspell`): the executable.
- `PI_SPELLFIX_DICTS` (`en_US`): hunspell's `-d`, comma-separated.
- `PI_SPELLFIX_PERSONAL` (none): the personal word list, shared with the Claude
  Code mod, so a word learned in one is known to the other.
