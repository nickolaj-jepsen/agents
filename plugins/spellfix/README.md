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
hunspell can't (`form` for `from`). Needs `hunspell` and its dictionaries
installed; set the executable, dictionaries and personal word list in the
plugin's options (`claude plugin configure spellfix`). Its picker is
the band button above the prompt; to open it from the keyboard, bind
`app:toggleDiffNoiseFilter` in the `Global` context of
`~/.claude/keybindings.json` (I use `ctrl+q`), which works on any draft.
