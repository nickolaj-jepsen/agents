---
tagline: "Open the checkout's repository, branch, commit or pull request, or hand it to an editor or file manager."
featured: true
status: in-progress
requires:
  - "`git`"
  - "`gh`, for the pull request"
order: 2
---

- `/git` opens the checkout's repository, branch, commit or pull request on
  GitHub, GitLab or Codeberg. It links the compare page for a new pull request,
  and copies the branch, SHA or PR URL.
- `/open` hands the checkout to VS Code, Zed, Sublime Merge, the file manager or
  Ghostty.
- `/open plan` lists the checkout's notes (`.agents/store`), newest first, and
  opens the one you pick in the editor.

Rows that can't run say why. In the terminal a number key picks a row; in the desktop app and
VS Code each row has a quiet button at its end, and a row that can't run has none.
