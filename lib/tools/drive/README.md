# `pnpm drive`

Run from the repository root after [dev setup](../../../docs/development.md#set-up-and-check-a-change). `pnpm drive` is the one driver: it parks real Claude Code, pi, Claude Code in VS Code and Claude Desktop on a scenario's screen, runs the scenarios as tests with canned turns, and records the site's media. `pnpm drive --help` and `pnpm drive <verb> --help` list every verb and flag.

A **package** is an app (`docfix`) or a kit component (`kit-card`); `kit` is every kit package and `apps` every app. A **scenario** is a named screen of a package, written for one harness in `src/e2e/` (apps) or `e2e/` (kit packages). A **session** is a parked agent on a scenario's screen.

| Harness   | What it is                                                 | Scenario file          | Verbs                                                                                        |
| --------- | ---------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| `claude`  | Claude Code in a terminal                                  | `claude.scenarios.ts`  | `terminal`, `snap`, `sweep` for a parked screen                                              |
| `pi`      | pi in a terminal                                           | `pi.scenarios.ts`      | `terminal`, `snap`, `sweep` for a parked screen                                              |
| `vscode`  | Claude Code in a VS Code window on its own display (Linux) | `vscode.scenarios.ts`  | all but `snap` and `test`; the screen through `cap`, `keys`, `click`, `wait`, `shot`, `eval` |
| `desktop` | Claude Desktop (Linux), launched on a seeded session       | `desktop.scenarios.ts` | `live` and `goto` only                                                                       |

`site.scenarios.ts` holds a package's recording, which `record` plays, not a harness. `drive test` runs the `claude` and `pi` scenarios; the tests are part of `check`, one `e2e` task per package.

## Live mode

```bash
pnpm drive ls                                              # the packages, and the sessions parked now
pnpm drive ls answer                                       # a package's scenarios, by harness
pnpm drive live answer open --harness claude               # replay in your terminal; Ctrl+] stops it
pnpm drive live answer cards-open --harness pi             # try the pi version instead
pnpm drive live answer form --harness vscode               # open a separate Linux VS Code window; close it to stop
pnpm drive live answer long-body --harness desktop         # a fixture in Claude Desktop (Linux); --draft for a real model
pnpm drive live answer cards-open --harness pi --watch              # replay on each save
pnpm drive live answer cards-open --harness pi --watch --in-place   # keep the pi conversation
pnpm drive live answer form --harness vscode --watch --in-place    # keep the visible Claude tab
pnpm drive live kit-card card/live --harness pi --watch             # a kit story
```

`--harness` is needed only when a scenario exists in several.

The view fits your window once the scripted steps finish. To change the size **during** those steps, pass `--size 96x30` in terminal cells or `--size 900x700` in VS Code pixels. Claude Desktop is only launched: it has no screen verbs.

`live` and `goto` take the same start flags, `--size` and `--draft` where they apply. Watching is `live`'s alone: it is the workflow a person iterates in, while a parked session an agent inspects changes only on `reload`.

- `--watch` rebuilds on edits to the app or its kits and replays the scenario. Terminal `live` keeps the old screen until the new one is ready; VS Code replaces the Claude tab in the same window. Edits to the scenario also trigger replay. Tests, snapshots and build outputs are ignored.
- `--watch --in-place` reloads plugin edits in the running session, without replaying. Scenario edits still replay because the running agent does not read the fixture or scripted steps.

Leaving a watched session (`Ctrl+]` in a terminal, closing the VS Code window) waits for the replay or rebuild already running and drops the saves queued behind it, so a late replay cannot take the screen after you leave. The two harnesses keep their own mechanics: terminal `live` starts the next session before taking the screen and closes the old one after; VS Code replays into the same window, cancelling a child replay it interrupted.

In Claude and VS Code, Claude's mod watcher reloads the built files. It waits for the folder to go quiet (terminal Claude can take up to a minute after frequent edits); `/reload-plugins` applies changes at once. In pi, a dev-only extension asks pi to reload once the agent is idle, without typing into the prompt. Pi keeps the conversation but recreates its extension runtime: open extension overlays and unsaved plugin state may not survive. VS Code `live` opens a window you can interact with directly; `goto` uses a headless window.

## Drive a parked session

`goto` parks a session of any harness on a scenario's screen; the other commands act on it from separate invocations. A session has a name, `--session NAME` (default `default`), and sessions of different names run at once. Names belong to the checkout: each worktree has its own `default`, and `stop --all` stops only this checkout's sessions. Their state is one file each under `${XDG_STATE_HOME:-~/.local/state}/agent-tools-e2e/sessions/<checkout>/`, holding the harness, the run folder and the daemon or DevTools port. A record is published whole, so a reader sees the one from before a write or the one after it, never half of either.

The verbs are `ls live goto reload terminal cap snap keys type paste click hover wait resize shot sweep stop eval compare test record cast types`. A verb a harness can't do says so, and names what does.

### A terminal session

A parked claude or pi session is read and driven through the tui-test CLI the repo pins. `drive terminal` chooses the session and its daemon, writes them in front of the command and passes the rest through, so the syntax is the CLI's own: what `drive terminal help` and `drive terminal usage` print is what to use. Its stdout, its `--json` output and the status it exits with come back as it gave them.

```bash
pnpm drive goto answer cards-open --harness pi          # park pi on that screen
pnpm drive terminal text                                # the screen as text
pnpm drive terminal click text "B ○ Postgres"           # click visible text; --nth N, --clicks 2
pnpm drive terminal expect text "B ● Postgres"          # wait for it; exits 1 when it never shows
pnpm drive terminal screenshot -o /tmp/shot.png         # a PNG of the screen
pnpm drive terminal --json get size                     # structured output, as the CLI prints it
pnpm drive sweep --out ./review                         # four test sizes; PNGs survive stop
pnpm drive snap                                         # the scenario's own snapshot: its region and masks
pnpm drive reload                                       # after an edit: rebuild, replay in a fresh session
pnpm drive stop                                         # end the session, its daemon, stub and folder

pnpm drive goto answer cards-open --harness pi --session b   # a second one beside it
pnpm drive terminal --session b text                         # --session is drive's, before the command
pnpm drive stop --all
```

`drive terminal` refuses what would take the session away from `drive`: `run`, `open`, `restart`, `close`, `daemon`, `kill`, `signal` and `sessions`, and a `--session` written after the command, where the CLI's own options start. `goto`, `reload` and `stop` own the lifecycle. The daemon is the driver's, not yours: it is found through `TUI_TEST_HOME`, so bare `tui-test` cannot reach it.

### A VS Code session

A VS Code session has no tui-test equivalent, so drive's own verbs drive it: `cap` reads the panel, `click` and `keys` act, `wait` waits for a pattern, `shot` photographs it, and `resize` and `eval` change the window and its DOM. See [VS Code](#vs-code).

### Reload and stop

Saving doesn't reload a parked session; `reload` does, at the session's current size. Watching belongs to the foreground: `goto` takes no `--watch`, so a parked screen changes only when the agent asks, and the screen it inspected is the one it acts on. `goto`, `reload` and `stop` of the same name take turns: one runs at a time across processes, and commands of another name never wait. The lock is the kernel's (an abstract socket on Linux; an advisory file lock via `python3` on macOS), so a command that dies releases it; its children may outlive it. `goto` is destructive: a session it replaces is stopped first. `reload` is protective: the new session starts beside the old one, takes its size, and only replaces the record once it is ready. If it fails to start, to resize or to publish, `reload` prints why, ends the candidate, and leaves the old session parked and attachable. In VS Code it opens a new Claude tab in the same window, and may name another scenario of the package; there is no rollback there, so a failed replay needs a fresh `goto`. A failed start removes its run folder unless `--keep` is given, which prints its path. `stop` ends the session, its daemon or window, its stub and its run folder. A parked session outlives its command by design; a run of `test`, `record`, `live` or `compare` does not, even killed: its stub watches the process that started it and ends the run's processes when it goes. `snap` (the scenario's snapshot of the screen as it is now, with its region and masks) is for the terminal agents and `eval` (an expression in the Claude webview) for VS Code; desktop has only `live` and `goto`. The driver finds tui-test via `TUI_TEST_BIN`, then `PATH`, then the release the repo pins, which it downloads and checks on first use (`pnpm turbo run @agents/drive#tui-test` fetches it ahead of time); `terminal` uses the same binary.

## Write a scenario

Copy the pattern in [docfix's Claude scenarios](../../../apps/docfix/src/e2e/claude.scenarios.ts) to `apps/<plugin>/src/e2e/claude.scenarios.ts` or `pi.scenarios.ts`. [The scenario types](lib/scenario.ts) document the steps, defaults, and how one screen can continue from another.

- Start with `start: { hermetic: true, plugins: ["<plugin>"], turns: [] }` on the set. `start.mcp` names stand-in MCP servers: Claude gets them as its config, and a hermetic pi gets them in its `mcp.json` for a plugin that reads it (pi's own MCP support stays off). A hermetic Claude is told it runs in Ghostty whatever terminal started the run, so the key its editors name for a new line (Shift+Enter, not `\` Enter) and the width their hints need are the same on every machine. Add [canned turns](lib/harness.ts) when the screen needs a model response. A non-hermetic run uses your own config; don't send a real prompt just to reach a screen.
- Use `setup` to create a fixture, never your real repository or notes store. A driver must carry the [fixture environment](lib/setup.ts) into git and the agent so neither reaches your hooks, notes or worktrees. Run folders are under `/tmp` by default so a user's longer `TMPDIR` doesn't change line wrapping.
- `start.bin` puts stand-in programs first on the agent's PATH; `start.hide` names programs on your PATH that it must not find (a scenario for a missing tool). The fixture environment also points hunspell's `WORDLIST` into the run folder, so your personal word list never changes what spellfix flags.
- Wait for text that the step introduces, not a title already in the transcript. Use `slashCommand` for a newly loaded Claude mod: the prompt may be ready before the command is registered.
- Crop to the plugin surface with [a region](lib/screen.ts). Use `extreme: true` for a state with long text, wide characters and more items than fit. If initial size changes layout, set `size` explicitly; the driver resizes a running session for snapshots.
- A kit package writes none of this: its `e2e/claude.scenarios.ts` and `pi.scenarios.ts` turn its stories into scenarios (see [the kit guide](../../kits/README.md#add-or-change-a-component)).
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

`drive test` also takes `--jobs N` (or `claude=1,pi=2`) for the sessions at once per harness, `--keep` to keep the run folders and logs, `--timing` and `--tmp DIR`. The flag's grammar is `DRIVE_JOBS`'s too, so a gate run without flags can be sized down on a loaded machine (`DRIVE_JOBS=1 pnpm gate`); the default scales with the cores, to at most 2 Claude and 4 pi sessions. Each app and kit package with scenarios has one `e2e` task, which reruns when its scenarios or snapshots, the harness (`lib/tools/drive/`), the builds it loads or the kit packages change. A cache hit writes no PNGs, so add `--force` when you want them. Commit only the `.snap` files under `__snapshots__/`. A mismatch writes `.actual.snap` and `.actual.png`; failed steps leave `*.actual.png`. Use `--jobs 1` to diagnose contention. A scenario that fails in a shared session fails the gate as it stands: it is not tried again alone, so look for state leaking between scenarios instead of updating the snapshot.

A plain `drive test` uses the in-process terminal adapter in a forked Vitest worker for fast text reads. If a step or snapshot fails, that worker can draw the original screen without replaying it: the font environment is fixed when the worker starts, not changed during capture. `--png` and terminal recordings use daemon sessions, which rasterize in the daemon. The recorder passes any fallback `ffmpeg` on the recording daemon's PATH, without changing the parent process's environment. The one picture still drawn in process is the evidence of a difference or failed step in a run without `--png`: that screen exists only in the in-process session, and drawing it from the daemon would mean replaying the scenario (which the gate does not do), so it is taken where it was read. The font home is published only when it is complete, so parallel jobs can share it.

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

- `shot` and `sweep` photograph VS Code at a device scale of 2, so text and icons are sharp when the picture is opened. The layout, which is the window's size in CSS pixels, is the same as at scale 1; zooming VS Code is not an option because it would change it. `--scale 1` gives the window's own density. `record` and the site's media keep scale 1.

- The kit's graphical stories have scenarios too: `pnpm drive goto kit-prose prose/blocks --harness vscode --size 420x800`. `nix run .#media -- record kit-prose --harness vscode` photographs each at the window's size and at a narrow pane, as `apps/site/media/kit/<name>/vscode-<component>-<state>[-narrow].png`.
- `compare` answers "is this screen at least as good as `main`'s?" in one command: it photographs every VS Code scenario of a package in this checkout and in another, wide (1280x720) and narrow (420x800), and writes a page that sets each pair side by side.

  ```bash
  git worktree add --detach ../agents-main origin/main
  (cd ../agents-main && pnpm install && pnpm turbo run build --filter=./apps/docfix)   # the base must be built
  pnpm turbo run build --filter=./apps/docfix                                          # and this checkout
  pnpm drive compare docfix --base ../agents-main                  # prints <folder>/index.html; --out DIR, --scale N
  ```

  Each scenario is parked as `goto` does, photographed, resized to 420x800 and photographed again, once per side; the two sides run at the same time, each in a session of its own name, so nothing else's session is touched. Both sides are played by this checkout's driver, so they are photographed alike. The page labels each side with its branch and short sha. A scenario that exists on one side only is shown alone and marked; one that fails to park is listed with its log (`*.log` beside the pictures) and the run goes on. The pictures show the parked state, before any interaction the scenario's description mentions. Allow about 25 seconds per scenario per side. A side whose `dist/` is missing fails at once with the build command.

- `reload` can replay a different scenario of the same package. Use `goto` when launch options change; the extension's own **New session** doesn't reload code. For parallel windows give each its own `--session`.
- `wait` can't match an input placeholder. Wait for a label instead.
- A mod that reads the prompt while rendering doesn't redraw on typing. If testing it requires a redraw, resize below the prompt's maximum width, then back; see [spellfix's recording](../../../apps/spellfix/src/e2e/site.scenarios.ts).
- Headless `goto` gives each compositor a private Wayland runtime directory. If the launcher exits before startup, the error prints a saved startup log path that survives run cleanup. Pass `--keep` to retain the rest of the failed run as well. If the installed VS Code exits before opening the workbench, try the pinned build: `nix run .#media -- goto docfix queue --harness vscode`.
- `sweep --out <dir>` keeps PNGs outside the run folder. Without `--out`, `stop` removes them with the run. See [graphical screen inspection](../../../skills/agent-plugin-dev/references/claude.md#looking-at-a-graphical-screen) for narrow, wide, and full-height screenshots.

## Claude Desktop

```bash
pnpm drive live answer long-body --harness desktop             # open that fixture in Claude Desktop on Linux; returns when it exits
pnpm drive goto answer long-body --harness desktop             # the same, left running; `stop` ends it
pnpm drive live answer recommended --harness desktop --draft   # a prefilled draft; choose Haiku before sending
pnpm drive live answer long-body --harness claude              # the same fixture in a Claude terminal
```

Desktop needs `claude` and `claude-desktop` on PATH. Sign in to the isolated test profile on first use and rerun the command if it stopped at sign-in. The profile is per checkout, under `${XDG_STATE_HOME:-$HOME/.local/state}/agent-tools-e2e/`. A scenario is `desktopScenarios` in `desktop.scenarios.ts` ([types](lib/desktop-scenario.ts)): its `start.turns` seed the session Desktop resumes.

## Site media

The site's pictures and demos are recorded, not committed. A package's `site.scenarios.ts` says what to record, and `record` writes it to `apps/site/media/<package>/`, replacing the files its own recorder wrote so no file outlives its scenario and the other recorder's stay. A kit package's pictures go to `apps/site/media/kit/<name>/`. The site builds without any of it and warns about what is missing.

A recording stages its files in a folder of its own and publishes them only when every scenario came out and fits its budget, so a failed capture leaves the published media as they were. The failure keeps that staging folder — the screenshots a broken step left or a screen it could not photograph — and prints where it is, for inspection without replaying the recording; `--keep` and `--timing` are not needed for it. Kit recording writes its pictures and failure evidence directly to its own staging folder, never beside the test snapshots. Recording depends on no stored snapshot and no test flag: a scenario marked as a known failure is recorded like any other, and a VS Code panel whose pictures are still undrawn fails its first capture instead of being given a fresh window.

Record in the media environment: `nix run .#media -- <drive verb>` runs the driver with VS Code, the fonts and the tools the scenarios call, and any other command runs as given.

```bash
nix run .#media -- record docfix                   # one package: its terminal demo, stills and VS Code pictures
nix run .#media -- record docfix --harness vscode  # only its VS Code pictures (Linux); `terminal` for the rest
nix run .#media -- record kit-card                 # a kit package's story pictures
nix run .#media -- record                          # every package
```

Turbo runs the same through each package's `media` task (the terminal's media) and `media:vscode` (VS Code's, Linux only). The `@agents/drive#media-env` task builds the environment first, so its hash is part of each recording's cache key and a recording from another environment is never restored. A recording whose inputs didn't change is restored, not replayed; add `--force` to record it anyway.

```bash
pnpm turbo run media                                    # every package's media, or restore it from the cache
pnpm turbo run media --filter=@nickolaj-jepsen/docfix   # one package's terminal media
pnpm turbo run media:vscode --filter=@nickolaj-jepsen/docfix
```

Write `apps/<plugin>/src/e2e/site.scenarios.ts` for a demo tour, its stills, and any VS Code pictures. [docfix's recording](../../../apps/docfix/src/e2e/site.scenarios.ts) is a working example; [the types](lib/site.ts) describe what the runner reads. Keep tours short and inspect the video for unintended account details, private paths, or distractions. If a capture is over budget, shorten the tour before changing the limits. Match side calls to their own canned turn with `match` rather than relying on their order. Use the [fake Linear server](lib/linear-mcp.ts) for Linear scenarios, not a logged-in account. The terminal's colours and geometry are in [`tui-test.toml`](tui-test.toml).

### Capture inline graphics

Set `capture: "kitty"` for a demo or still with terminal images. The ordinary rasterizer doesn't render Kitty image placeholders. Run `nix run .#media -- record image-preview` to replay in Kitty on a private display (Linux).

`cast` exports an existing trusted asciicast v2 without rerunning a scenario:

```bash
nix run .#media -- cast /path/to/demo.mp4.tui-test.cast ./image-preview   # --require-graphics fails when the cast has no Kitty graphics
```

It replays the cast's terminal escape sequences and overwrites the output prefix's `.mp4` and `.png`; it doesn't update the site's media.

## Load a mod's types

Claude writes its API types when it loads the mod. `pnpm drive types <app>` starts a hermetic Claude with a copy of the app's build (`kit-catalog` works too), waits for the declarations to finish writing, then publishes `.claude-types/` beside the app's `dist/`. The package's `types` task runs it, and `check-types` reads the snapshot without racing a Claude session writing into `dist/`. Run `pnpm turbo run types` after a Claude Code upgrade.
