# Workflow notes

Keep a feature's spec, tickets and research together in `.agents/workflows/<slug>/`. This is a view of the project's agent-notes store, shared by its worktrees, not a directory of tracked issues. No tracker login, labels or setup skill is needed.

From the checkout root, run `agent-notes root --ensure`, then `mkdir -p .agents/store/workflows`. If `.agents/workflows` does not exist, create the relative link with `ln -s store/workflows .agents/workflows`. Verify `test .agents/workflows -ef .agents/store/workflows` before writing. If that fails, stop rather than replacing an existing link or directory.

Use the workflow named by the user or the current spec or ticket. For new work choose a short lowercase kebab-case slug; ask if more than one existing workflow fits. Put `spec.md`, `research.md` and `tickets/01-<ticket>.md` under that slug. Reuse the folder across stages. Ask before overwriting notes. Give workers absolute paths in the shared store; report the checkout-relative paths to the user.
