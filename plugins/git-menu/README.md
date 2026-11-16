---
tagline: "Open the checkout's repository, branch, commit or pull request, hand it to an editor or file manager, and review the diff in tuicr."
featured: true
status: in-progress
requires:
  - "`git`"
  - "`gh`, for the pull request"
  - "`tuicr` and Ghostty, for `/open diff`"
order: 2
---

`/git` opens the checkout's repository, branch, commit or pull
request on GitHub, GitLab or Codeberg, links the compare page for a new pull
request, and copies the branch, SHA or PR URL; `/open` hands the checkout to
VS Code, Sublime Merge, the file manager or Ghostty, `/open plan` lists the
checkout's notes (`.agents/store`) for the editor, and `/open diff` opens
[tuicr](https://github.com/agavra/tuicr) on the changes in a new Ghostty
window and tells the model how to read your comments back. Rows that
can't run say why. Needs `git`, `gh` for the pull request, and `tuicr` and
Ghostty for `/open diff`.
