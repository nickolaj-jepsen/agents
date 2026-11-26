# Changelog

## [Unreleased]

- A store per repository, outside git and shared by every worktree, linked into each checkout as `.agents/store` when a session starts.
- `/notes` lists, reads and opens what is in it, in Claude Code and pi; Claude Code's own memory for the project is listed too.
- A note is only handed to an app that is set up: one whose `ready` check fails, such as a terminal with no terminal chosen, is passed over for the next app that takes the file.
- When none can take a note, the message names the app that is there but not set up, or that has no terminal to run in, instead of saying no app is installed.
