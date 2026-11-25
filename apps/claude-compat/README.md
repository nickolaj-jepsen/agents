---
tagline: "Claude Code habits in pi."
featured: false
order: 9
---

pi only. The session you started has it; subagents don't.

- `/new` and its alias `/clear` start a fresh session with the current model and thinking
  level, without changing the startup defaults. `/effort <level>` sets the thinking level.
- `/skill-name` anywhere in a prompt runs that skill, not just `/skill:name` first.
- `ctrl+s` stashes the draft and clears the editor. On an empty editor it restores the
  draft, and sending a prompt restores it too. One file per repository, so it survives
  `/new`, `/resume` and a restart.
