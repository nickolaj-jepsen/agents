# Plugin screen tests and recordings

Run from the repository root after [dev setup](../../../docs/development.md#set-up-and-check-a-change). `pnpm drive` is the one driver: it parks real Claude Code, pi, Claude Code in VS Code and Claude Desktop on a scenario's screen, runs the scenarios as tests with canned turns, and records the site's media. The tests are part of `check`, one `e2e` task per plugin.

`pnpm drive --help` and `pnpm drive <verb> --help` list every verb and flag.

## Live mode

```bash
pnpm drive ls                                              # the packages, and the sessions parked now
pnpm drive ls answer                                       # a package's scenarios, by harness
pnpm drive live answer open --harness claude               # replay in your terminal; Ctrl+] stops it
pnpm drive live answer open --harness pi                   # try the pi version instead
pnpm drive live answer form --harness vscode               # open a separate Linux VS Code window; close it to stop
pnpm drive live answer long-body --harness desktop         # a fixture in Claude Desktop (Linux); --draft for a real model
pnpm drive live answer open --harness pi --watch           # replay again on each save
pnpm drive live kit-card live --harness pi --watch         # a kit story
```

`<package>` is an app (`docfix`) or a kit component (`kit-card`); `kit` is every kit package and `apps` every app. `--harness` is needed only when a scenario exists in several.

The view fits your window once the scripted steps finish. To change the size **during** those steps, pass `--size 96x30` in terminal cells or `--size 900x700` in VS Code pixels. Claude Desktop is only launched: it has no `cap`, `keys` or `shot`.

With `--watch`, each save under the app's `src/`, the kit packages it imports or the scenario's folder rebuilds the app (`lib/tools/build/build.ts`), starts the agent over and replays the steps. The old session stays on screen until the new one reaches the screen. If the new code fails to start, its error takes the screen's place; save again to retry. Tests, snapshots and build output don't count as saves.

For Claude, `--watch --in-place` keeps the session and lets Claude reload the mod itself, which keeps what you clicked. Claude waits for the folder to go quiet first: a few seconds, or up to a minute when you save often. Type `/reload-plugins` to reload at once.

## Drive a parked session

`goto` parks a session of any harness on a scenario's screen; the other verbs act on it from separate commands. A session has a name, `--session NAME` (default `default`), and sessions of different names run at once. Names belong to the checkout: each worktree has its own `default`, and `stop --all` stops only this checkout's sessions. Their state is one file each under `${XDG_STATE_HOME:-~/.local/state}/agent-tools-e2e/sessions/<checkout>/`, holding the harness, the run folder and the daemon or DevTools port.

```bash
pnpm drive goto docfix queue --harness pi                   # park a session at the queue
pnpm drive cap                                              # read the screen as text
pnpm drive keys Down Enter                                  # act on the focused row
pnpm drive click "docs/hosts.md"                            # click visible text; --nth N, --double
pnpm drive shot                                             # a PNG of the screen; prints the path
pnpm drive sweep                                            # PNGs at all four test sizes (VS Code: narrow and wide)
pnpm drive reload                                           # after an edit: rebuild, replay in a fresh session
pnpm drive stop                                             # end the session

pnpm drive goto docfix queue --harness claude --session b   # a second one beside it
pnpm drive cap --session b
pnpm drive stop --all
```

The verbs are `ls live goto reload cap snap keys type paste click hover wait resize shot sweep stop eval test record cast types`. A verb a harness can't do says so: `snap` (the scenario's snapshot of the screen as it is now) is for the terminal agents, `eval` (an expression in the Claude webview) for VS Code, and desktop has only `live` and `goto`.

Saving doesn't reload a parked session; `reload` does, at the session's current size. If the new session fails to start, `reload` prints why and leaves the old one parked. In VS Code it opens a new Claude tab in the same window, and may name another scenario of the package. `goto ... --watch` takes the same flags as live mode, reloads on each save and prints the screen; Ctrl+C stops watching and leaves the session parked. A failed start removes its run folder unless `--keep` is given, which prints its path. The driver finds tui-test via `TUI_TEST_BIN`, then `PATH`, then the release the repo pins, which it downloads and checks on first use (`pnpm turbo run @agents/drive#tui-test` fetches it ahead of time).

## Write a scenario

Copy the pattern in [docfix's Claude scenarios](../../../apps/docfix/src/e2e/claude.scenarios.ts) to `apps/<plugin>/src/e2e/claude.scenarios.ts` or `pi.scenarios.ts`. [The scenario types](lib/scenario.ts) document the steps, defaults, and how one screen can continue from another.

- Start with `start: { hermetic: true, plugins: ["<plugin>"], turns: [] }` on the set. `start.mcp` names stand-in MCP servers: Claude gets them as its config, and a hermetic pi gets them in its `mcp.json` for a plugin that reads it (pi's own MCP support stays off). Add [canned turns](lib/harness.ts) when the screen needs a model response. A non-hermetic run uses your own config; don't send a real prompt just to reach a screen.
- Use `setup` to create a fixture, never your real repository or notes store. A driver must carry the [fixture environment](lib/setup.ts) into git and the agent so neither reaches your hooks, notes or worktrees. Run folders are under `/tmp` by default so a user's longer `TMPDIR` doesn't change line wrapping.
- Wait for text that the step introduces, not a title already in the transcript. Use `slashCommand` for a newly loaded Claude mod: the prompt may be ready before the command is registered.
- Crop to the plugin surface with [a region](lib/screen.ts). Use `extreme: true` for a state with long text, wide characters and more items than fit. If initial size changes layout, set `size` explicitly; the driver resizes a running session for snapshots.
- `snapshots: false` makes a screen for `live` and `goto` only, with no test. The answer app's fixtures are such scenarios of Claude, pi and Desktop (`drive live answer long-body --harness desktop`).

## Snapshots

```bash
pnpm drive test docfix                  # compare one package with its committed snapshots
pnpm drive test docfix -t band          # the tests whose name matches, as vitest's -t
pnpm drive test docfix --png            # also write PNGs for inspection
pnpm drive test docfix --update         # accept intentional changes; inspect the diff
pnpm drive test kit                     # every kit package
pnpm turbo run e2e                      # every package, `drive test <package>` each; a package whose inputs didn't change is a cache hit
pnpm turbo run e2e:update --filter=@nickolaj-jepsen/docfix   # the same with --update, never cached
```

`drive test` also takes `--jobs N` (or `claude=1,pi=2`) for the sessions at once per harness, `--keep` to keep the run folders and logs, `--timing` and `--tmp DIR`; none of them is an environment variable. Each app and kit package with scenarios has one `e2e` task, which reruns when its scenarios or snapshots, the harness (`lib/tools/drive/`), the builds it loads or the kit packages change. A cache hit writes no PNGs, so add `--force` when you want them. Commit only the `.snap` files under `__snapshots__/`. A mismatch writes `.actual.snap` and `.actual.png`; failed steps leave `*.actual.png`. Use `--jobs 1` to diagnose contention. If a scenario fails only in a shared session and passes when retried alone, look for state leaking between scenarios instead of updating the snapshot.

Under Ghostty's test backend, Claude's terminal `Image` may show only its alt text. To check pixels, use a graphics-capable terminal or [capture inline graphics](#capture-inline-graphics).

## VS Code

Use Linux with `code`, the `anthropic.claude-code` extension, and Nix for the headless compositor. The driver opens an isolated workspace and profile. It doesn't run snapshot tests. Write scenarios in `vscode.scenarios.ts` using [the VS Code scenario types](lib/vscode-scenario.ts).

```bash
pnpm drive goto docfix queue --harness vscode --size 420x800   # open the real Claude panel
pnpm drive cap                                                 # read the panel as text
pnpm drive shot                                                # write a PNG of the panel (--window: the whole window)
pnpm drive reload                                              # read edited mods in a new Claude tab
pnpm drive stop                                                # close the window and its stub
```

- `reload` can replay a different scenario of the same package. Use `goto` when launch options change; the extension's own **New session** doesn't reload code. For parallel windows give each its own `--session`.
- `wait` can't match an input placeholder. Wait for a label instead. If a shot shows icon alt text after `reload`, run `goto` and take it again.
- A mod that reads the prompt while rendering doesn't redraw on typing. If testing it requires a redraw, resize below the prompt's maximum width, then back; see [spellfix's recording](../../../apps/spellfix/src/e2e/site.scenarios.ts).
- For a failed start, retain the run with `--keep` and inspect `vscode.log`. See [graphical screen inspection](../../../skills/agent-plugin-dev/references/claude.md#looking-at-a-graphical-screen) for narrow, wide, and full-height screenshots.

## Claude Desktop

```bash
pnpm drive live answer long-body --harness desktop             # open that fixture in Claude Desktop on Linux; returns when it exits
pnpm drive goto answer long-body --harness desktop             # the same, left running; `stop` ends it
pnpm drive live answer recommended --harness desktop --draft   # a prefilled draft; choose Haiku before sending
pnpm drive live answer long-body --harness claude              # the same fixture in a Claude terminal
```

Desktop needs `claude` and `claude-desktop` on PATH. Sign in to the isolated test profile on first use and rerun the command if it stopped at sign-in. The profile is per checkout, under `${XDG_STATE_HOME:-$HOME/.local/state}/agent-tools-e2e/`. A scenario is `desktopScenarios` in `desktop.scenarios.ts` ([types](lib/desktop-scenario.ts)): its `start.turns` seed the session Desktop resumes.

## Site media

```bash
pnpm turbo run media                                    # record the site's assets, or restore them from the cache
nix run .#media -- record docfix                        # rerecord one package: its terminal demo, stills and VS Code pictures
nix run .#media -- record docfix --harness vscode       # only its VS Code pictures (Linux)
nix run .#media -- record kit-card                      # a kit package's story pictures
nix run .#media -- record                               # every package
```

Record in the media environment: `nix run .#media -- <drive verb>` runs the driver in it, with VS Code, the fonts and the tools the scenarios call (any other command runs as given). The `//#media-env` task builds it, so its hash is part of each recording's cache key and a recording from another environment is never restored. A recording whose inputs didn't change is restored, not replayed; add `--force` to record it anyway. `record <package>` writes only `apps/site/media/<package>/` (a kit package's pictures go to the folder the kit packages share, `apps/site/media/kit/`) and removes what it wrote before, so no file outlives its scenario. The site builds without any of it.

The site reads generated files under `apps/site/media/`; don't commit them.

Use `apps/<plugin>/src/e2e/site.scenarios.ts` for a demo tour, its stills, and any VS Code pictures. [docfix's recording](../../../apps/docfix/src/e2e/site.scenarios.ts) is a working example; [the types](lib/site.ts) describe what the runner reads. Keep tours short and inspect the video for unintended account details, private paths, or distractions. If a capture is over budget, shorten the tour before changing the limits. Match side calls to their own canned turn with `match` rather than relying on their order. Use the [fake Linear server](lib/linear-mcp.ts) for Linear scenarios, not a logged-in account.

### Capture inline graphics

Set `capture: "kitty"` for a demo or still with terminal images. The ordinary rasterizer doesn't render Kitty image placeholders. Run `nix run .#media -- record image-preview` to replay in Kitty on a private display (Linux).

To export an existing trusted asciicast v2 without rerunning a scenario, use `nix run .#media -- cast /path/to/demo.mp4.tui-test.cast ./image-preview`. It replays the cast's terminal escape sequences and overwrites the output prefix's `.mp4` and `.png`; it doesn't update the site's media.

## Load a mod's types

`pnpm drive types <app>` starts a hermetic Claude with the app's build, waits for `dist/.claude-plugin/types/` to appear and stops.
