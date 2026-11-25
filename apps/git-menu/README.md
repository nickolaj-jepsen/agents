---
tagline: "Open the checkout's repository, branch, commit or pull request, or hand it to an editor or file manager."
featured: true
requires:
  - "`git`"
  - "`gh`, for the pull request"
order: 2
---

| Command      | What to use it for                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/git`       | Open a repository, branch, commit or pull request on GitHub, GitLab or Codeberg, or copy the branch, SHA or PR URL. For a new PR, open the compare page. |
| `/open`      | Open the checkout in VS Code, Zed, Sublime Merge, the file manager or a terminal.                                                                        |
| `/open plan` | Pick a note from `.agents/store`, newest first, and open it in the editor.                                                                               |

Press the row's number in the terminal or click its action in Desktop or VS Code. Disabled rows explain what's missing.

**Terminal** opens a fresh shell in the checkout. On Linux it uses the desktop's
terminal selection via `xdg-terminal-exec`, falling back to `x-terminal-emulator`
where available. On macOS it uses Terminal.app.

To use a different terminal, set `GIT_MENU_TERMINAL` in the environment that
starts Claude Code. Set it to an executable name on `PATH` or an absolute path,
not a shell command. The launcher starts in the checkout directory. If your
terminal needs flags to open a fresh shell or honor that directory, point the
variable at a wrapper that passes those flags.
