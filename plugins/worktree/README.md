---
tagline: "Move a pi session into a git worktree and back to the primary checkout, keeping the conversation."
featured: true
requires:
  - "`git`"
  - "`wt`, the worktree manager (a home-manager module, not this flake)"
order: 6
---

pi only, session you started only. The session moves itself: pi pins a
session's working directory at startup, so a move forks the conversation into a
new session file rooted at the target and switches to it.

- `enter_worktree` (a tool) creates a worktree, or picks an existing one, and
  moves the session there. A new worktree starts from `base`, by default the
  default branch, so uncommitted changes in the current checkout stay behind.
  The call ends the turn, and the session continues in the worktree.
- `exit_worktree` moves the session back to the repository's primary checkout
  and closes the worktree it leaves: `wt close` commits anything uncommitted as
  a wip commit and keeps the branch until its work is in the default branch.
- `/wt <name> [base]` and `/back` are the same moves, for you; `/wt` without a
  name picks from the worktrees that already exist.
- While a move is queued, any other tool call is blocked, so nothing runs
  between the decision and the move.

A worktree stays open when a session is quit or moves to another one:
`wt clean` sweeps those, and landing work stays an explicit `wt land`.
