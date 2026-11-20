# Plugin screen tests and recordings

Run from the repository root after [dev setup](../docs/development.md#set-up-and-check-a-change). The local screen suite drives real Claude Code and pi with canned turns. It isn't part of `just check`.

## Live mode

```bash
npm run e2e:cli -- ls answer                  # list saved screens
just e2e-live answer open --harness claude    # replay in your terminal; Ctrl+] stops it
just e2e-live answer open --harness pi        # try the pi version instead
just e2e-live answer form --harness vscode    # open a separate Linux VS Code window; close it to stop
```

The view fits your window once the scripted steps finish. To change the size **during** those steps, pass `--size 96x30` in terminal cells or `--size 900x700` in VS Code pixels. For the Desktop app, see [Claude Desktop](#claude-desktop).

## Drive a parked terminal session

```bash
npm run e2e:cli -- goto docfix queue --harness pi  # park a session at the queue
npm run e2e:cli -- cap                            # read the screen as text
npm run e2e:cli -- keys Down Enter                # act on the focused row
npm run e2e:cli -- sweep                          # write PNGs at all four test sizes
npm run e2e:cli -- stop                           # end the session
```

Run `npm run e2e:cli` for all verbs. After editing pi code, run `goto` again. For parallel runs, give each driver its own `XDG_STATE_HOME` and short `XDG_RUNTIME_DIR`: the saved state and daemon socket are separate. The CLI finds tui-test via `TUI_TEST_BIN`, then `PATH`, then `.#tui-test` (use `nix build .#tui-test` to build it yourself).

## Write a scenario

Copy the pattern in [docfix's Claude scenarios](docfix/claude.scenarios.ts) to `e2e/<plugin>/claude.scenarios.ts` or `pi.scenarios.ts`. [The scenario types](lib/scenario.ts) document the steps, defaults, and how one screen can continue from another.

- Start with `start: { hermetic: true, plugins: ["<plugin>"], turns: [] }` on the set. Add [canned turns](lib/harness.ts) when the screen needs a model response. A non-hermetic run uses your own config; don't send a real prompt just to reach a screen.
- Use `setup` to create a fixture, never your real repository or notes store. A driver must carry the [fixture environment](lib/setup.ts) into git and the agent so neither reaches your hooks, notes or worktrees. Run folders are under `/tmp` by default so a user's longer `TMPDIR` doesn't change line wrapping.
- Wait for text that the step introduces, not a title already in the transcript. Use `slashCommand` for a newly loaded Claude mod: the prompt may be ready before the command is registered.
- Crop to the plugin surface with [a region](lib/screen.ts). Use `extreme: true` for a state with long text, wide characters and more items than fit. If initial size changes layout, set `size` explicitly; the driver resizes a running session for snapshots.

## Snapshots

```bash
just e2e docfix                                  # compare one plugin with its committed snapshots
E2E_PNG=1 just e2e docfix                        # also write PNGs for inspection
E2E_UPDATE=1 just e2e docfix                     # accept intentional changes; inspect the diff
```

Commit only the `.snap` files under `e2e/<plugin>/__snapshots__/`. A mismatch writes `.actual.snap` and `.actual.png`; failed steps leave `*.actual.png`. Set `E2E_KEEP=1` to keep the session and logs. Use `E2E_JOBS=1` to diagnose contention. If a scenario fails only in a shared session and passes when retried alone, look for state leaking between scenarios instead of updating the snapshot.

Under Ghostty's test backend, Claude's terminal `Image` may show only its alt text. To check pixels, use a graphics-capable terminal or [capture inline graphics](#capture-inline-graphics).

## VS Code

Use Linux with `code`, the `anthropic.claude-code` extension, and Nix for the headless compositor. The driver opens an isolated workspace and profile. It doesn't run snapshot tests. Write scenarios in `vscode.scenarios.ts` using [the VS Code scenario types](lib/vscode-scenario.ts).

```bash
npm run e2e:vscode -- goto docfix queue --size 420x800  # open the real Claude panel
npm run e2e:vscode -- cap                              # read the panel as text
npm run e2e:vscode -- shot                            # write a PNG of the panel
npm run e2e:vscode -- reload                          # read edited mods in a new Claude tab
npm run e2e:vscode -- stop                            # close the driver and its stub
```

- `reload` can replay a different scenario of the same plugin. Use `goto` when launch options change; the extension's own **New session** doesn't reload code. For parallel drivers set a distinct `E2E_VSCODE_SESSION` on every command.
- `wait` can't match an input placeholder. Wait for a label instead. If a shot shows icon alt text after `reload`, run `goto` and take it again.
- A mod that reads the prompt while rendering may not redraw on typing. If testing it requires a redraw, resize below the prompt's maximum width, then back; see [spellfix's recording](spellfix/site.scenarios.ts).
- For a failed start, retain the run with `E2E_KEEP=1` and inspect `vscode.log`. See [graphical screen inspection](../skills/agent-plugin-dev/references/claude.md#looking-at-a-graphical-screen) for full-height screenshots and overflow checks.

## Claude Desktop

```bash
just answer-demo long-body                        # try a canned round in a Claude terminal
just claude-desktop-dev long-body                 # open that fixture in Claude Desktop on Linux
just claude-desktop-dev recommended live          # open a prefilled draft; choose Haiku before sending
```

Desktop needs `claude` and `claude-desktop` on PATH. Sign in to the isolated test profile on first use and rerun the command if it stopped at sign-in. The profile is per checkout; saved sessions are kept alongside it under `${XDG_STATE_HOME:-$HOME/.local/state}/agent-tools-e2e/`.

## Site media

```bash
just media                # get or record all site assets before building the site
just site-shots docfix    # rerecord just this plugin's terminal demo and stills
just site-vscode docfix   # retake just its VS Code pictures on Linux
```

The site reads generated files under `site/media/`; don't commit them. Stage new scenarios before `just media` so Nix can see them. For a local recording from the checkout as it stands, use `just media-fresh`.

Use `e2e/<plugin>/site.scenarios.ts` for a demo tour, its stills, and any VS Code pictures. [docfix's recording](docfix/site.scenarios.ts) is a working example; [the types](lib/site.ts) describe what the runner reads. Keep tours short and inspect the video for unintended account details, private paths, or distractions. If a capture is over budget, shorten the tour before changing the limits. Match side calls to their own canned turn with `match` rather than relying on their order. Use the [fake Linear server](lib/linear-mcp.ts) for Linear scenarios, not a logged-in account.

### Capture inline graphics

Set `capture: "kitty"` for a demo or still with terminal images. The ordinary rasterizer doesn't render Kitty image placeholders. Run `nix develop .#media -c just site-shots image-preview` to replay in Kitty on a private display (Linux).

To export an existing trusted asciicast v2 without rerunning a scenario, use `just capture-cast /path/to/demo.mp4.tui-test.cast ./image-preview`. It replays the cast's terminal escape sequences, overwrites the output prefix's `.mp4` and `.png`, and doesn't update the site's manifest.
