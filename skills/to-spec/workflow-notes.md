# Workflow notes

Keep a feature's spec, tickets and research together in `.agents/store/workflows/<slug>/`. This is the project's store, `.agents/store/` at the checkout's root, shared by all its checkouts when the notes plugin is installed; it is not a directory of tracked issues. No tracker login, labels or setup skill is needed.

From the checkout root, run `mkdir -p .agents/store/workflows/<slug>` before writing.

Use the workflow named by the user or the current spec or ticket. For new work choose a short lowercase kebab-case slug; ask if more than one existing workflow fits. Put `spec.md`, `research.md` and `tickets/01-<ticket>.md` under that slug. Reuse the folder across stages. Ask before overwriting notes. Give workers absolute paths in the store; report the checkout-relative paths to the user.
