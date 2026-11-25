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

Press the row's number in the terminal or click its action in Desktop or VS Code. A row that can't run keeps its place and says why, for example `not installed`. The keyboard starts on the first app that is installed. Links open in the first installed app that takes a link, which is the browser unless you say otherwise.

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

On Linux the Terminal row needs `xdg-terminal-exec` on your `PATH`. Without it the row says `not installed`; there is no other fallback. To use a terminal you already have, give the `terminal` app your own command in `open.json`:

```json
{ "apps": [{ "id": "terminal", "command": "kitty", "dir": ["--directory", "{dir}"] }] }
```

## `open.json`

Your own apps and forges go in `$XDG_CONFIG_HOME/agents/open.json`, or `~/.config/agents/open.json` when that is not set. The file is read each time a menu opens, so an edit applies at once. If it can't be read, a toast starting `open.json:` says what was left out, and the rest still works.

It holds two lists, both optional.

**`apps`** is a list of apps. Each one has:

| Field      | What it is                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`       | Its name. Required. The id of a built-in app (`code`, `zed`, `smerge`, `files`, `terminal`, `browser`) changes that app; any other id adds a new one. |
| `label`    | The row's text. The id when you don't give one.                                                                                                       |
| `command`  | An executable name, or a list of names: the first one found on `PATH` runs. Required for a new app.                                                   |
| `dir`      | Arguments that open a folder. The app is offered for folders only if it has these.                                                                    |
| `file`     | Arguments that open a file, for plugins that open one. `/open` and `/git` don't use it.                                                               |
| `url`      | Arguments that open a link. An app with `url` is a candidate for the links `/git` opens.                                                              |
| `terminal` | `true` for a program that runs in a terminal. It starts inside a new window of the `terminal` app, after that app's `dir` arguments.                  |
| `requires` | A path that must exist for the app to count as installed.                                                                                             |
| `hidden`   | `true` takes the app off the list, built-in or not.                                                                                                   |

The argument lists take `{dir}`, `{file}`, `{line}` and `{url}`. `{dir}` is the checkout, and for a file the folder it is in when none is given. A file with no line loses `:{line}`. Setting `command` on a built-in app drops its `requires`, because a macOS bundle says nothing about another program. Setting a field to `null` removes it from a built-in app: `"file": null` stops it from taking files. A new app needs `command` and at least one of `dir`, `file` or `url`; one that lacks them is left out and reported.

**The order.** Your apps come first, in your order, each laid over the built-in app with the same id. The built-in apps you don't mention follow, in their own order. The first installed app that takes the kind of thing being opened is the default. Put an app first to make it the default.

**`forges`** maps the host of a self-hosted forge to the forge it runs: `github`, `gitlab` or `codeberg`. Without it, `/git` links only `github.com`, `gitlab.com` and `codeberg.org`, because a guessed link that 404s is worse than none. With it, a remote on that host gets the repository, branch, commit and compare links of that forge. Creating a pull request is offered for GitHub only.

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
