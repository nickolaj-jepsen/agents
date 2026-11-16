---
tagline: "Picks fixes for misspelled words in the prompt draft with hunspell and Haiku."
featured: true
requires:
  - "`hunspell` and its dictionaries"
order: 3
---

Picks fixes for misspelled words in the prompt draft with
hunspell and Haiku. One Haiku call answers every flagged word, adds the ones
it calls correct to the personal word list, and finds real-word typos
hunspell can't (`form` for `from`). Its picker is the band button above the
prompt. Needs `hunspell` and its dictionaries installed.

## Keys

To open the picker from the keyboard, bind `app:toggleDiffNoiseFilter` in the
`Global` context of `~/.claude/keybindings.json` (I use `ctrl+q`); it works on
any draft.

## Options

`claude plugin configure spellfix`:

- `hunspell` (`hunspell`): the executable.
- `dictionaries` (`en_US`): hunspell's `-d`, comma-separated.
- `personalDictionary` (none): the personal word list Haiku's answers are added to.
