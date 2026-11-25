---
tagline: "A store per repository for what agents write beside the code, shared by every worktree and kept out of git; /notes lists and reads it."
featured: true
requires:
  - "`git`"
order: 2
---

Agents write plans, findings, reports and screenshots that belong to a repository but not to its history. `notes` keeps them in a **store**: one folder per repository, outside the repository, that every checkout of it sees as `.agents/store`. Skills and agents write there, and the agent is told to, once a conversation, wherever `.agents/store` is the shared store. A checkout whose `.agents/store` is the repository's own tracked folder, or one a notice says is left alone, is not told it is shared.

## The store

The stores live in `$XDG_DATA_HOME/agents/store/<name>`, or `~/.local/share/agents/store/<name>` when `XDG_DATA_HOME` is not set. A repository's name is its main checkout's folder and a short hash of its path, such as `shop-api-1a2b3c4d`. It is written once to `agents-store-id` in the repository's common git directory, so every worktree finds the same store and a repository that moves keeps it.

The plugin links the checkout when a session starts, and again when the session moves to another checkout or a subagent starts in a worktree of its own. The link is kept out of `git status` by a line in the repository's `info/exclude`. A folder in no git repository has no store, and nothing is created there.

If another session holds the store for more than a few seconds, or the link fails, the plugin does not try that folder again for 30 seconds, so a stuck store cannot slow every prompt. Opening `/notes` tries again at once, and says when another session is still setting the store up.

When `.agents/store` is already a real folder, because something wrote there before the plugin linked it:

- **Untracked:** its files move into the store and the link takes its place. If the store already has a file of the same name, nothing moves and a notice says which folder to sort out by hand.
- **Tracked by git:** it is the repository's own folder and is left alone, with a notice; `/notes` lists it.
- **A link to somewhere else**, or a file: left alone, with a notice.

## `/notes`

`/notes` lists the store's notes, its Markdown and HTML files, under the folder each is in, the folder written to last first and each note's age beside it. Any other file is an **artefact**: counted beside its folder, never listed. In Claude Code the last group is `memory`: what Claude Code itself saved about the project (its `autoMemoryDirectory` when that is an absolute path or starts with `~/`, else the project's folder under `~/.claude/projects`). The plugin reads it and never moves it.

1. Move with `↑`/`↓` (or `j`/`k`), or click a row.
2. Press `Enter`, or click a row, to read a Markdown note in the pane. The arrows, Page Up, Page Down and the wheel scroll it; `Esc` or **Back** goes back to the list at the same row. A note over 256 KiB is not read there.
3. Press `Enter` on an HTML note to open it in the browser.
4. Press `o`, or click **Open**, to hand the note to your editor.

Opening uses the apps of the `open` plugin and your `~/.config/agents/open.json`: a note goes to the first installed app that takes a file (VS Code, then Zed, by default), an HTML note to the first that takes a link. There is no editing, deleting or searching: hand the note to your editor for that.

In pi `/notes` is a sidebar on the right; drag its left edge to resize it. In Claude Code the pane has the keyboard after `/notes`, a click in it or `ctrl+x tab`. Desktop and VS Code show the same list as a pane, each row with **Read**, or **Open** for an HTML note, and the reader with **Back** and **Open**.

## After a turn

When a turn writes notes, a line above the prompt names the newest, or how many there are: `✓ Note written: plans/retry-after.md`. Click it to read the newest, or **Dismiss** it. Opening `/notes` clears it too. In pi the line is a widget for the mouse that names `/notes` for the keyboard.

The line is about the newest note written this session. The store is shared by every worktree of the repository, so a note counts only when its modified time falls inside one of this session's turns, from the turn's start to its end with 2 seconds of slack for the file system's clock; notes another session writes between this session's turns are not news here. A note another session writes while one of this session's turns runs still counts, as the store cannot say whose it is. Opening `/notes` or dismissing the line starts the count again.
