# Testing plugins

Open a saved scenario and try it yourself. From the checkout, run
`nix develop` and `just dev-setup` if you need the repository’s test tools.

```bash
npm run e2e:cli -- ls answer
just e2e-live answer open --harness claude
just e2e-live answer open --harness pi
just e2e-live answer form --harness vscode
```

Live mode runs the scenario’s steps, then hands you the controls in the same
session. Use your keyboard or mouse and resize the window as you go.
Press `Ctrl+]` to end a terminal replay. VS Code live mode runs on a Linux desktop
with the Claude Code extension installed. Close the replay window when you're done.

For [snapshots](../e2e/README.md#snapshots), [VS Code](../e2e/README.md#vs-code), or
[Claude Desktop](../e2e/README.md#claude-desktop), see the harness reference.
