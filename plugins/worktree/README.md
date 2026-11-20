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

Ask pi to work in a worktree. When it reports the change ready, it stays there
so you can test and request follow-ups. Ask it to return to the primary checkout
when you're ready to leave.

- `enter_worktree` creates or reopens a worktree by `name`, or enters an open
  worktree by `path`. If neither is set, it generates a name. A new worktree
  starts from `base`, or the default branch if omitted. Uncommitted changes
  in the current checkout stay behind.
- `exit_worktree` returns to the primary checkout. The default action, `keep`,
  leaves the worktree on disk. Use `remove` with `discard_changes: true` only
  when asked to close it. Unlike Claude Code's native removal, pi runs `wt close`,
  which saves uncommitted changes on the branch before removing the checkout.

Both tools move the session at the end of the turn. To land, exit with `keep`
first, then run `wt land` from the primary checkout.
