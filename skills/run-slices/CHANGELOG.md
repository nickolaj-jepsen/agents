# Changelog

## [Unreleased]

- Writes to `.agents/store/` in the checkout the session started in, creating it when it is missing, without the `agent-notes` command; from another worktree it uses that folder's absolute path.
- The preflight links a build worktree's `.agents/store` to the project's store, so what a worker writes there survives the worktree's removal.

## [0.1.0] - 2026-11-25

- First versioned release.
