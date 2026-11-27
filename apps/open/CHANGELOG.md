# Changelog

## [Unreleased]

- **Breaking:** replaces `git-menu`. `/open` and `/git` keep their names, and `/open plan` still opens the checkout's notes, now through the `notes` plugin that draws them.
- The folder menu has a **Notes** row again, before Copy path: it runs `/notes` rather than holding a list of its own, and says so where that plugin is not installed.
- **Breaking:** the apps come from a built-in table with `~/.config/agents/open.json` laid over it, which also names self-hosted forges. `GIT_MENU_TERMINAL` and `FIREPROOF_EDITOR` are no longer read.
- Works in pi as well as Claude Code.
