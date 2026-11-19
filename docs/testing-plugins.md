# Testing plugins

Test checkout plugins in Claude Code, pi, VS Code, or Claude Desktop. A saved scenario loads
sample data and opens the plugin at a specific screen.

## Claude Code and pi terminals

From the repo root, enter `nix develop` for the clients and test tools. Run `just dev-setup`
to install dependencies and link the pi packages.

For scenarios that use your usual profile, sign in to Claude Code as needed. The driver uses
`claude-dev` and `pi-dev` when available to load checkout plugins. With plain `claude` or `pi`,
configure the client to load them first.

```bash
npm run e2e:cli -- ls answer
npm run e2e:cli -- goto answer open --harness claude
npm run e2e:cli -- sweep
npm run e2e:cli -- stop
```

`goto` leaves the session running in the background. Use `--harness pi` to open the same
example in pi. Try `keys`, `type`, or `click` to check focus and draft behaviour.

`sweep` prints paths to PNGs at four terminal sizes. Check wrapping and scrolling in the
captures before `stop` deletes them.

To test by hand, save the checkout path with `repo="$PWD"` from the repo root. Switch to a
scratch repository for plugins that touch files, branches, or notes. Then launch either client.

```bash
claude --plugin-dir "$repo/plugins/answer"
pi -e "$repo/plugins/answer"
```

Run `just e2e answer` for Answer's terminal snapshots in both clients, or
`just e2e answer -t claude.open$` for the Claude Code opening screen. For output and updates,
see the [snapshot reference](../e2e/README.md#snapshots).

## VS Code

On Linux, put `code` and `nix` on PATH and install `anthropic.claude-code`. The driver opens a
headless VS Code window with a separate profile and plays canned replies without signing in.

```bash
npm run e2e:vscode -- ls
npm run e2e:vscode -- goto answer form
npm run e2e:vscode -- sweep
npm run e2e:vscode -- stop
```

`cap` prints the Claude panel as text. Use `click`, `type`, or `keys` to try the controls.
Open the screenshots before `stop` deletes them.

After editing a mod, use `reload` to replay the scenario in a fresh Claude tab.

## Claude Desktop

On Linux, put `claude` and `claude-desktop` on PATH.

```bash
just claude-desktop-dev
just claude-desktop-dev long-body
```

The launcher opens a saved Answer conversation in a test profile. On first use, sign in and
rerun the command if Desktop opened on the sign-in screen. Pick an option, add a note, and
check that **Fill prompt** preserves your draft.

For a fresh model reply, run `just claude-desktop-dev recommended live`. In the Code tab,
select Haiku and send the prefilled prompt. See the
[launcher reference](../e2e/README.md#claude-desktop) for fixtures and profile storage.

## Where to start with each plugin

Pass the plugin and scenario to `goto`, as in `npm run e2e:vscode -- goto linear-issue draft`.

| Plugin                                                      | Client and starting check                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [answer](../plugins/answer/README.md)                       | Claude Code or pi `answer open`, VS Code `answer form`, or the Desktop launcher. Pick an answer, add a note, and check the review.                                                                                                                       |
| [claude-compat](../plugins/claude-compat/README.md)         | pi. Type a draft, press Ctrl+S to stash it, then press Ctrl+S in the empty editor to restore it.                                                                                                                                                         |
| [docfix](../plugins/docfix/README.md)                       | Claude Code, pi, or VS Code `docfix queue`. Open a row to read its evidence, mark it Apply, and submit. Check that a draft appears in the prompt.                                                                                                        |
| [exa](../plugins/exa/README.md)                             | pi. Set `PI_EXA_KEY_FILE` and ask pi to use `exa_search` on a sample query, then `exa_fetch` on a result.                                                                                                                                                |
| [git-menu](../plugins/git-menu/README.md)                   | VS Code `git-menu git` or `git-menu folder`. In Claude Code, run `/git` or `/open` in a scratch Git checkout to check which actions it offers.                                                                                                           |
| [image-preview](../plugins/image-preview/README.md)         | Claude Code `image-preview read` checks the fallback text. In Kitty or Ghostty, ask Claude to use `Read` on a local PNG and check its proportions and clickable path.                                                                                    |
| [linear-issue](../plugins/linear-issue/README.md)           | VS Code `linear-issue draft` or `linear-issue filed` uses a test Linear server. In Claude Code or Desktop with Linear connected, run `/linear` with a sample note and inspect the draft before filing.                                                   |
| [lsp](../plugins/lsp/README.md)                             | pi. Set `PI_LSP_SERVERS` for the language under test. Have pi write a type error to a scratch file and check the diagnostics on the tool result.                                                                                                         |
| [questions](../plugins/questions/README.md)                 | pi `questions multi`. Toggle choices, choose Done, and check the answers returned to the tool.                                                                                                                                                           |
| [spellfix](../plugins/spellfix/README.md)                   | With Hunspell installed, type a draft with `teh` in Claude Code or pi and open the picker using the plugin's keybinding. In VS Code, start with `spellfix picker`. If Review is missing, run `npm run e2e:vscode -- resize 560 720` to redraw the draft. |
| [transcript-tweaks](../plugins/transcript-tweaks/README.md) | pi. Ask pi to run a short shell command and reply. Check the collapsed tool result and the vertical rule beside the reply.                                                                                                                               |
| [worktree](../plugins/worktree/README.md)                   | pi `worktree returned` with `wt` installed. Check that the conversation follows the move and the working directory returns to the primary checkout.                                                                                                      |
