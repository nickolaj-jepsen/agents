# Plugin screen tests and recordings

Run from the repository root after [dev setup](../docs/development.md#set-up-and-check-a-change). The local screen suite drives real Claude Code and pi with canned turns. It is part of `check`, one `e2e` task per plugin.

## Live mode

```bash
pnpm turbo run e2e:cli -- ls answer                                   # list saved screens
pnpm turbo run e2e-live --ui=tui -- answer open --harness claude      # replay in your terminal; Ctrl+] stops it
pnpm turbo run e2e-live --ui=tui -- answer open --harness pi          # try the pi version instead
pnpm turbo run e2e-live --ui=tui -- answer form --harness vscode      # open a separate Linux VS Code window; close it to stop
pnpm turbo run e2e-live --ui=tui -- answer open --harness pi --watch  # replay again on each save
pnpm turbo run kit-live --ui=tui -- card/live --harness pi            # a kit story, with --watch on; --no-watch turns it off
```

`e2e-live` and `kit-live` are interactive tasks: `--ui=tui` opens turbo's task list. Select the task and press `i` to send it your keys; `Ctrl+Z` gives them back to turbo.

The view fits your window once the scripted steps finish. To change the size **during** those steps, pass `--size 96x30` in terminal cells or `--size 900x700` in VS Code pixels. For the Desktop app, see [Claude Desktop](#claude-desktop).

With `--watch`, each save under the app's `src/`, the kit packages or the scenario's folder rebuilds the apps (`lib/tools/build/build.ts`), starts the agent over and replays the steps. The old session stays on screen until the new one reaches the screen. If the new code fails to start, its error takes the screen's place; save again to retry. Tests, snapshots and the kit's copies don't count as saves.

For Claude, `--watch --in-place` keeps the session and lets Claude reload the mod itself, which keeps what you clicked. Claude waits for the folder to go quiet first: a few seconds, or up to a minute when you save often. Type `/reload-plugins` to reload at once.

## Drive a parked terminal session

Run these with `node` itself, not through turbo: turbo stops what a task leaves behind, so a session parked by `goto` would die with its task. The `e2e:cli` task is for verbs that finish, like `ls`.

```bash
node lib/tools/drive/cli.ts goto docfix queue --harness pi  # park a session at the queue
node lib/tools/drive/cli.ts cap                             # read the screen as text
node lib/tools/drive/cli.ts keys Down Enter                 # act on the focused row
node lib/tools/drive/cli.ts sweep                           # write PNGs at all four test sizes
node lib/tools/drive/cli.ts reload                          # after an edit: rebuild, replay in a fresh session
node lib/tools/drive/cli.ts stop                            # end the session
```

Run `node lib/tools/drive/cli.ts` for all verbs. Saving doesn't reload a parked session; `reload` does, at the session's current size. If the new session fails to start, `reload` prints why and leaves the old one parked. `goto ... --watch` takes the same flags as live mode, reloads on each save and prints the screen; Ctrl+C stops watching and leaves the session parked. A failed start removes its run folder unless `E2E_KEEP=1` is set, which prints its path. For parallel runs, give each driver its own `XDG_STATE_HOME` and short `XDG_RUNTIME_DIR`: the saved state and daemon socket are separate. The CLI finds tui-test via `TUI_TEST_BIN`, then `PATH`, then the release the repo pins, which it downloads and checks on first use (`pnpm turbo run @agents/e2e#tui-test` fetches it ahead of time).

## Write a scenario

Copy the pattern in [docfix's Claude scenarios](../../../apps/docfix/src/e2e/claude.scenarios.ts) to `apps/<plugin>/src/e2e/claude.scenarios.ts` or `pi.scenarios.ts`. [The scenario types](lib/scenario.ts) document the steps, defaults, and how one screen can continue from another.

- Start with `start: { hermetic: true, plugins: ["<plugin>"], turns: [] }` on the set. `start.mcp` names stand-in MCP servers: Claude gets them as its config, and a hermetic pi gets them in its `mcp.json` for a plugin that reads it (pi's own MCP support stays off). Add [canned turns](lib/harness.ts) when the screen needs a model response. A non-hermetic run uses your own config; don't send a real prompt just to reach a screen.
- Use `setup` to create a fixture, never your real repository or notes store. A driver must carry the [fixture environment](lib/setup.ts) into git and the agent so neither reaches your hooks, notes or worktrees. Run folders are under `/tmp` by default so a user's longer `TMPDIR` doesn't change line wrapping.
- Wait for text that the step introduces, not a title already in the transcript. Use `slashCommand` for a newly loaded Claude mod: the prompt may be ready before the command is registered.
- Crop to the plugin surface with [a region](lib/screen.ts). Use `extreme: true` for a state with long text, wide characters and more items than fit. If initial size changes layout, set `size` explicitly; the driver resizes a running session for snapshots.

## Snapshots

```bash
pnpm turbo run e2e --filter=@agents/e2e-docfix              # compare one plugin with its committed snapshots
pnpm turbo run e2e                                          # every plugin; a package whose inputs didn't change is a cache hit
E2E_PNG=1 pnpm turbo run e2e --filter=@agents/e2e-docfix --force  # also write PNGs for inspection
pnpm turbo run e2e:update --filter=@agents/e2e-docfix       # accept intentional changes (never cached); inspect the diff
node lib/tools/drive/run.ts docfix -t 'band'                            # one scenario, outside turbo
```

Each app and kit package with scenarios has one `e2e` task, which reruns when its scenarios or snapshots, the harness (`lib/tools/drive/`), the builds it loads or the kit packages change. A cache hit writes no PNGs, so add `--force` when you want them. Commit only the `.snap` files under `e2e/<plugin>/__snapshots__/`. A mismatch writes `.actual.snap` and `.actual.png`; failed steps leave `*.actual.png`. Set `E2E_KEEP=1` to keep the session and logs. Use `E2E_JOBS=1` to diagnose contention. If a scenario fails only in a shared session and passes when retried alone, look for state leaking between scenarios instead of updating the snapshot.

Under Ghostty's test backend, Claude's terminal `Image` may show only its alt text. To check pixels, use a graphics-capable terminal or [capture inline graphics](#capture-inline-graphics).

## VS Code

Use Linux with `code`, the `anthropic.claude-code` extension, and Nix for the headless compositor. The driver opens an isolated workspace and profile. It doesn't run snapshot tests. Write scenarios in `vscode.scenarios.ts` using [the VS Code scenario types](lib/vscode-scenario.ts).

```bash
node lib/tools/drive/vscode.ts goto docfix queue --size 420x800  # open the real Claude panel
node lib/tools/drive/vscode.ts cap                               # read the panel as text
node lib/tools/drive/vscode.ts shot                              # write a PNG of the panel
node lib/tools/drive/vscode.ts reload                            # read edited mods in a new Claude tab
node lib/tools/drive/vscode.ts stop                              # close the driver and its stub
```

- `reload` can replay a different scenario of the same plugin. Use `goto` when launch options change; the extension's own **New session** doesn't reload code. For parallel drivers set a distinct `E2E_VSCODE_SESSION` on every command.
- `wait` can't match an input placeholder. Wait for a label instead. If a shot shows icon alt text after `reload`, run `goto` and take it again.
- A mod that reads the prompt while rendering doesn't redraw on typing. If testing it requires a redraw, resize below the prompt's maximum width, then back; see [spellfix's recording](spellfix/site.scenarios.ts).
- For a failed start, retain the run with `E2E_KEEP=1` and inspect `vscode.log`. See [graphical screen inspection](../skills/agent-plugin-dev/references/claude.md#looking-at-a-graphical-screen) for narrow, wide, and full-height screenshots.

## Claude Desktop

```bash
pnpm turbo run answer-demo --ui=tui -- long-body       # try a canned round in a Claude terminal
pnpm turbo run claude-desktop-dev -- long-body         # open that fixture in Claude Desktop on Linux
pnpm turbo run claude-desktop-dev -- recommended live  # open a prefilled draft; choose Haiku before sending
```

Desktop needs `claude` and `claude-desktop` on PATH. Sign in to the isolated test profile on first use and rerun the command if it stopped at sign-in. The profile is per checkout; saved sessions are kept alongside it under `${XDG_STATE_HOME:-$HOME/.local/state}/agent-tools-e2e/`.

## Site media

```bash
nix develop .#media -c pnpm turbo run media                  # record the site's assets, or restore them from the cache
nix develop .#media -c pnpm turbo run site-shots -- docfix   # rerecord just this plugin's terminal demo and stills
nix develop .#media -c pnpm turbo run site-vscode -- docfix  # retake just its VS Code pictures on Linux
```

Record in the media shell: it holds VS Code, the fonts and the tools the scenarios call, and exports `AGENTS_MEDIA_ENV`, which changes with any of them and is part of each recording's cache key, so a recording from another environment is never restored. A recording whose inputs didn't change is restored, not replayed; add `--force` to record it anyway. The site builds without any of it.

The site reads generated files under `apps/site/media/`; don't commit them.

Use `apps/<plugin>/src/e2e/site.scenarios.ts` for a demo tour, its stills, and any VS Code pictures. [docfix's recording](../../../apps/docfix/src/e2e/site.scenarios.ts) is a working example; [the types](lib/site.ts) describe what the runner reads. Keep tours short and inspect the video for unintended account details, private paths, or distractions. If a capture is over budget, shorten the tour before changing the limits. Match side calls to their own canned turn with `match` rather than relying on their order. Use the [fake Linear server](lib/linear-mcp.ts) for Linear scenarios, not a logged-in account.

### Capture inline graphics

Set `capture: "kitty"` for a demo or still with terminal images. The ordinary rasterizer doesn't render Kitty image placeholders. Run `nix develop .#media -c pnpm turbo run site-shots -- image-preview` to replay in Kitty on a private display (Linux).

To export an existing trusted asciicast v2 without rerunning a scenario, use `pnpm turbo run capture-cast -- /path/to/demo.mp4.tui-test.cast ./image-preview`. It replays the cast's terminal escape sequences, overwrites the output prefix's `.mp4` and `.png`, and doesn't update the site's manifest.
