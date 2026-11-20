---
tagline: "Move a pi session into a git worktree and back to the primary checkout, keeping the conversation."
featured: true
requires:
  - "`git`"
  - "`wt`, the worktree manager (a home-manager module, not this flake)"
order: 6
---

Ask pi to work in a named worktree. Your session moves when the turn ends and keeps its conversation. A new worktree starts from the default branch unless you give it a base; uncommitted changes stay in the checkout you left.

Ask pi to return to the primary checkout when you're done. It leaves the worktree open by default so you can resume it. Only ask it to close the worktree if you want it removed from disk: `wt close` saves uncommitted work on its branch.

To land, ask pi to return without closing the worktree, then run this from the primary checkout:

```bash
wt land my-worktree  # land the named worktree and close it on success
```
