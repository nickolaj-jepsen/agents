---
tagline: "Open the checkout in your own editor, file manager or terminal, and its repository, branch or pull request on the forge."
featured: true
status: in-progress
requires:
  - "`git`"
  - "`gh`, for the pull request"
  - "`xdg-terminal-exec`, for the Terminal row on Linux"
order: 2
---

| Command | What to use it for                                                                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/git`  | Open a repository, branch, commit or pull request on GitHub, GitLab or Codeberg, or copy the branch, SHA or PR URL. For a new PR, open the compare page. |
| `/open` | Open the checkout in an editor, the file manager or a terminal, or copy its path.                                                                        |

Both commands work in Claude Code and in pi, with the same rows in the same order. Press the row's number in a terminal or click its action in Desktop or VS Code. A press in the first 600 ms after the rows appear or change is ignored, so a second Enter meant for the command doesn't open the preselected row, and a press while another is still being carried out is dropped. A row that can't run keeps its place and says why, for example `not installed` or `not set up`. The keyboard starts on the first app that is installed. Links open in the first installed app that takes a link, which is the browser unless you say otherwise.

## In pi

The menu is a sheet over the transcript that stands on the prompt's top rule. The keys are the same as in Claude Code: the arrows move, Enter or a row's number presses it, and Esc closes the menu. You can also click a row or Close, and the wheel scrolls a long list.

- The menu shows its own messages under the rows: why a row can't run, that no app takes a link, and what's wrong with `open.json`. After a press closes the menu, the transcript says what happened, such as `Copied the branch name` or `Couldn't start …`.
- Copy uses pi's clipboard, the same one `/copy` uses.
- Apps start detached from pi, so closing pi leaves them open.
- In RPC mode, where pi draws no terminal UI, the command shows the menu as a numbered list of what each row would open or copy and doesn't run anything.

## Apps

With no configuration, `/open` offers these, in this order. An app that isn't installed is listed and can't be pressed.

| App           | Linux                           | macOS                                  |
| ------------- | ------------------------------- | -------------------------------------- |
| VS Code       | `code`                          | `/Applications/Visual Studio Code.app` |
| Zed           | `zed`, or `zeditor`             | `/Applications/Zed.app`                |
| Sublime Merge | `smerge`                        | `/Applications/Sublime Merge.app`      |
| Files, Finder | `nautilus`, or `xdg-open`       | Finder                                 |
| Terminal      | `xdg-terminal-exec --dir={dir}` | Terminal.app                           |
| Browser       | `xdg-open`                      | `open`                                 |

On Linux the Terminal row needs `xdg-terminal-exec` on your `PATH`, and a terminal chosen for it: the row runs `xdg-terminal-exec --print-id` (the `ready` check below) and says `not set up` when that fails. Without the program the row says `not installed`; there is no other fallback. To use a terminal you already have, give the `terminal` app your own command in `open.json`:

```json
{ "apps": [{ "id": "terminal", "command": "kitty", "dir": ["--directory", "{dir}"] }] }
```

## `open.json`

Your own apps and forges go in `$XDG_CONFIG_HOME/agents/open.json`, or `~/.config/agents/open.json` when that is not set. The file is read each time a menu opens, so an edit applies at once. If it can't be read, a toast starting `open.json:` says what was left out, and the rest still works.

It holds two lists, both optional.

**`apps`** is a list of apps. Each one has:

| Field      | What it is                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`       | Its name. Required. The id of a built-in app (`code`, `zed`, `smerge`, `files`, `terminal`, `browser`) changes that app; any other id adds a new one.      |
| `label`    | The row's text. The id when you don't give one.                                                                                                            |
| `command`  | An executable name, or a list of names: the first one found on `PATH` runs. Required for a new app.                                                        |
| `dir`      | Arguments that open a folder. The app is offered for folders only if it has these.                                                                         |
| `file`     | Arguments that open a file, for plugins that open one. `/open` and `/git` don't use it.                                                                    |
| `url`      | Arguments that open a link. An app with `url` is a candidate for the links `/git` opens.                                                                   |
| `terminal` | `true` for a program that runs in a terminal. It starts inside a new window of the `terminal` app, after that app's `dir` arguments.                       |
| `requires` | A path that must exist for the app to count as installed.                                                                                                  |
| `ready`    | Arguments to run with the found command when a menu opens; an app that exits with anything but 0 is listed as `not set up`. Built in for Linux's terminal. |
| `hidden`   | `true` takes the app off the list, built-in or not.                                                                                                        |

The argument lists take `{dir}`, `{file}`, `{line}` and `{url}`. `{dir}` is the checkout, and for a file the folder it is in when none is given. A file with no line loses `:{line}`. Setting `command` on a built-in app drops its `requires`, because a macOS bundle says nothing about another program. Setting a field to `null` removes it from a built-in app: `"file": null` stops it from taking files. A new app needs `command` and at least one of `dir`, `file` or `url`; one that lacks them is left out and reported. Setting `command` on a built-in app also drops its `ready`, and `"ready": null` removes it. The ids `copy` and `more`, and any id starting `frame:` or `kit-`, belong to the menu's own rows and controls: an app with one is left out and reported.

**The order.** Your apps come first, in your order, each laid over the built-in app with the same id. The built-in apps you don't mention follow, in their own order. The first installed app that takes the kind of thing being opened is the default. Put an app first to make it the default.

**`forges`** maps the host of a self-hosted forge to the forge it runs: `github`, `gitlab` or `codeberg`. A host that has a port is written with it, `git.example.com:8443`. An `http` or `https` remote is looked up by its host with the port first, then without, and its links keep the remote's scheme and port; an ssh remote is linked at `https://<host>` with no port. Without it, `/git` links only `github.com`, `gitlab.com` and `codeberg.org`, because a guessed link that 404s is worse than none. With it, a remote on that host gets the repository, branch, commit and compare links of that forge. Creating a pull request is offered for GitHub only.

A complete example:

```json
{
  "apps": [
    { "id": "nvim", "label": "Neovim", "command": "nvim", "dir": ["{dir}"], "terminal": true },
    { "id": "terminal", "command": "kitty", "dir": ["--directory", "{dir}"] },
    { "id": "browser", "command": ["firefox", "xdg-open"], "url": ["{url}"] },
    { "id": "smerge", "hidden": true }
  ],
  "forges": {
    "git.example.com": "gitlab",
    "code.example.org": "codeberg"
  }
}
```

Here Neovim opens the checkout in a new kitty window and is the default, then come Terminal, then the built-in apps that are left (VS Code, Zed, Files), and Sublime Merge is gone. Links open in Firefox, or `xdg-open` where there is none.

## Limits

- A branch that tracks a branch of the same remote under another name (`wip` on `origin/feature/real-name`) links the remote's name. A branch pushed to a fork, or to a remote other than the one the links go to, links the name it has locally, which the forge's repository may not have.
