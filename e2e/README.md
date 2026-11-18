# e2e

End-to-end tests for plugin screens, in the real Claude Code and the real pi.
They are local only: `npm test`, the nix build and `just check` never run them.

One scenario is one named screen of one plugin: the fixture, how the agent starts,
and the steps that reach the screen. The same file feeds two things:

- `npm run e2e` plays every scenario and compares its screen with a stored snapshot.
- `goto` parks a live session on a scenario so you can keep driving it by hand.

The engine is [tui-test](https://github.com/microsoft/tui-test) with its Ghostty backend, the
terminal emulator it drives. Tests run it in-process under vitest. `goto` uses its CLI daemon,
which keeps a session alive between invocations (`pkgs/tui-test`).

## Write a scenario

Add `e2e/<plugin>/claude.scenarios.ts` or `pi.scenarios.ts`; `docfix/claude.scenarios.ts` is the
worked example. Every field of `scenarios({...})` and of a step, with its default, is on the
`ScenarioSet`, `Scenario` and `Step` types in `lib/scenario.ts`.

A click lands in the middle of the visible text. When the same text shows twice, `{ text, nth }`
picks a later one.

The agent runs in its own empty folder under the temp dir, with the checkout's plugins:
`claude-dev --strict-mcp-config` and `pi-dev`. Claude is your signed-in account, so send no prompts
a screen does not need. Both can replay canned turns with `start.turns` (`Turn` in
`lib/harness.ts`).

For Claude those turns come from `lib/stub.ts`, a stand-in for Anthropic's Messages API on a free
127.0.0.1 port for that session only (`ANTHROPIC_BASE_URL`,
`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`). It runs under your sign-in and never touches stored
config, reads or logs headers, and is stopped with the session. A turn after the last gets
"(stub: no more turns)". An `error` is a 400, since Claude retries a 5xx and that eats the next
turn.

The files of the fixture are yours to make. Never point a scenario at your real
store or repository.

## Snapshots

A state is snapshotted at 70x24 and 160x45 (`SIZES` in `lib/session.ts`). A scenario with
`extreme: true` gets all four sizes, adding 112x32 and 240x60. The session starts at `size` and is
resized between snapshots.

A scenario's `sizes` replaces them, as the kit catalogue does (`e2e/kit/sizes.ts`).

A snapshot is the styled text of the plugin's own surface, and `lib/screen.ts` documents it: the
`region` with its helpers, the built-in masks and `{ pattern, with }`, and the file's rows of
text, runs of style ids and legend.

Only the `.snap` files are committed. A PNG of the whole terminal is drawn for review, and a run
draws none unless one of these asks for it:

- `E2E_PNG=1`: a `.png` beside every snapshot;
- a state that differs: `*.actual.snap` and `*.actual.png` beside it;
- a scenario whose steps fail: `<scenario>@failed.actual.png`.

`sweep`, `shot` and `npm run catalog` draw PNGs too. Git ignores every `.png` and `*.actual.*`.

Files live in `e2e/<plugin>/__snapshots__/<harness>/<scenario>@<cols>x<rows>.snap`.

## Run

```bash
npm run e2e                  # all scenarios
npm run e2e docfix           # one plugin
npm run e2e docfix -- -t queue
E2E_UPDATE=1 npm run e2e docfix   # accept what is on screen (or pass -u)
```

Read the diff of the `.snap` files before you commit an update. For the pictures, run
`E2E_UPDATE=1 E2E_PNG=1 npm run e2e <plugin>` and open the PNGs.
`E2E_KEEP=1` keeps each run's folder under the temp dir.

## How a run goes

The scenarios of a run are played first, together, then the tests read what each came to.

- Sessions run side by side: each agent gets a pool of them, sized by `E2E_JOBS_CLAUDE`,
  `E2E_JOBS_PI`, or `E2E_JOBS` for both. The default is a share of the CPU count, per agent
  (`lib/runner.ts`).
- A scenario that continues another (`from`) plays in the same session when it can: the parent is
  snapshotted, then the child's own steps go on from where it stands.
  - Where scenarios branch from one parent, only one child continues the session. The others start
    again and replay the parent's steps.
  - A scenario with `reset: [steps]` that put the session back on the screen it started from (its
    parent's, or the fresh start) lets its siblings take turns in one session. The kit catalogue is
    one session per agent that way.
  - `fresh: true` always gets a session of its own, as does a scenario with its own `setup` or
    `start`.
- A shared session must not change a snapshot. A scenario that fails or differs in a shared session
  is run again alone and the difference is printed (`e2e: ... failed in the session of ...`). That
  is a leak between scenarios: a plugin bug to fix, not a snapshot to update.
- Claude Code now and then starts in its classic renderer ("fullscreen didn't finish starting last
  time"). That start is dropped and made once more, and the run says so.
- Before a Claude state is snapshotted the driver waits out `◐ medium · /effort`, which a start
  shows for a while and which shifts the inline layout by a row at narrow sizes (the wait is in
  `lib/session.ts`).
- After a step the driver waits for the screen to stop changing (a quiet window, in
  `lib/session.ts`), unless a `wait` step follows, which says what to wait for.

## goto

```bash
npm run e2e:cli -- ls docfix
npm run e2e:cli -- goto docfix queue [--harness pi] [--size 120x36]
npm run e2e:cli -- snap                   # the scenario's snapshot, as it is now
```

`npm run e2e:cli` alone lists the other verbs. One session lives at a time, and `goto` replaces it.
Each verb prints the screen after it. The CLI finds `tui-test` through `TUI_TEST_BIN`, then `PATH`,
then builds `.#tui-test` from this flake.

## Traps

- PNGs need fonts under `$HOME/.local/share/fonts`, which NixOS lacks. `lib/fonts.ts`
  links the ones fontconfig knows into a cache folder and swaps `HOME` for that one
  call. `goto`'s daemon is started with that `HOME` and the child gets the real one.
- The daemon's socket path must stay short, so it lives in `$XDG_RUNTIME_DIR/tt-e2e`.
- tui-test has no paste call: `paste` wraps the text in bracketed-paste escapes.
  `type` sends a newline as a raw `\n`.
- Claude's `Image` draws its `alt` under the Ghostty backend: its debug log reports
  `kittyGraphics=no` for `libghostty`. Screenshots check the fallback and layout text; use
  `claude plugin test` to check the image source and cell box, and a graphics-capable terminal
  to inspect the pixels.
- After a resize pi leaves old rows on screen outside its surface. The crop hides
  them, which is why every snapshot has a region.
- A test session never inherits the parent agent's `CLAUDE_CODE_*` variables, or it would print
  "Transcript saving is off".

## Site media

The project site's videos and screenshots are played from the same engine, on a stubbed model. A
run needs no sign-in and no model call, and comes out the same each time.

```bash
just site-shots                  # every plugin with an e2e/<plugin>/site.scenarios.ts
just site-shots docfix answer    # only those plugins
```

A run writes `site/media/<plugin>/`: `demo.mp4` and its poster `demo.png` (`demo-pi.*` for a second
harness's demo), a `<still>.png` per still, and `media.json`, the captions, sizes and paths the site
reads, relative to the repo root.

The files are not committed. `just media` builds `.#site-media` and `.#site-kit`, which record in the
same hermetic shell: the agents from this flake's nixpkgs, the fonts, ffmpeg and hunspell, and nothing
of the machine's. The Pages workflow builds the same two.

A plugin whose run fails keeps its old files, and the failed screens are left in the temp folder it
names. `E2E_KEEP=1` and `SITE_JOBS=<n>` (scenarios side by side) work as in the regression run.
Needs `tui-test`, and `ffmpeg` for the video: without one on PATH the runner builds nixpkgs' and
clears `LD_LIBRARY_PATH` for it.

### Add a site scenario

`e2e/<plugin>/site.scenarios.ts`, never `claude.scenarios.ts` / `pi.scenarios.ts`: the regression
run reads those and these are not snapshots. `docfix/site.scenarios.ts` is the worked example;
`SiteSet`, `SiteDemo` and `SiteScenario` in `lib/site.ts` document the fields.

- A plugin with both halves gives a demo per harness, the first shown first.
- The demo is a tour of 15 to 40 seconds. Its poster is the last screen unless a `poster` step
  takes it earlier. `slow(text)` types a key at a time at a human rhythm, seeded so it is the same
  on every run, and ends on a short beat before Enter.
  - The recorder cuts each `sleep` to about 70% and varies it (`pace` in `lib/site.ts`). Write a
    sleep as the dwell you mean and expect a little less.
  - `slowPress(key, n)` repeats a key at a pace a field that redraws on every key keeps up with.
- A still is the screen after its steps. Give a plugin with both halves at least one pi still.
- The default size (`SITE_SIZE` in `lib/site.ts`) suits a column of 1000 to 1100 px.
- Nothing unintended is on screen: no account, no path of the person's, no email, no real
  repository. Look at the frames (`ffmpeg -i demo.mp4 -vf fps=1/3 …`) before committing.

### What makes it hermetic

- `start.hermetic: true` runs plain `claude` with every mod of the checkout (`start.plugins` narrows
  it), never the `claude-dev` wrapper, so the screens are the same on any machine. Claude gets a
  config folder of its own (`lib/harness.ts`): onboarding done, the stub's API key approved,
  fullscreen, manual permissions, the keys the READMEs ask for, no hooks, status line, debug banner
  or account. pi gets its own agent folder and loads only `start.plugins` (`plugins/<name>`), with
  no skills or context files, theme `dark`.
- The agent runs in `/tmp/s-<random>/<project>`, so its header shows no home folder.
- `start.bin` puts stand-ins first on PATH (git-menu's `gh`, which would otherwise ask GitHub).
- `claude-dev` / `pi-dev` are used with their checkout swapped for this one, so a session loads the
  plugins of the tree the run is in (a worktree's), also in the regression run.

### The model stub

`start.turns` is a list the stub serves to the main loop in order, as in a regression scenario. A
turn with `match: "text"` is not part of that list: it is served, once, to the request whose system
prompt or messages contain the text. A side call that races the main loop (spellfix's Haiku check,
linear-issue's drafter and duplicate check) gets its own answer that way, whatever the order. A
request nothing matches is answered as before ("Stub" for a side call without tools).

`STUB_LOG=<file>` appends a line per request (model, tool count, the start and end of what it says,
never headers), to find the text to match. The stub's safety rules stand: localhost, one session, no
header is read.

Claude Code's built-in "You should know" side agent does not call the model through the stub (no
request of it reaches the stub, with the stub's key or with an account), so the card and the Learn
more flow of linear-issue cannot be played; the site shows `/linear` only.

### The fake Linear server

`lib/linear-mcp.ts` is a stdio MCP server written by hand (newline-delimited JSON-RPC, no
dependencies) that serves fixtures for the tools linear-issue calls, one of its issues the duplicate
the stubbed check can pick. Name it `linear` in `start.mcp` (`mcp: linearMcp`): linear-issue finds
its server by a tool name like `mcp__linear__save_issue`. A write is answered with a made-up key
and recorded to `linear-writes.jsonl` in the run's folder, and the site runner fails a scenario that
made one.

### Budgets

Each `.mp4` and each `.png` has a budget, which the site's check enforces (`BUDGET` in
`lib/site.ts`). `VIDEO_ZOOM`, `FPS` and `IDLE` are there too, as is why a recording is drawn at
twice an image's scale for the same zoom. A PNG over budget goes through oxipng. A video over
budget fails the run with its size: shorten the tour, or lower `FPS`. Colours, padding and window
chrome are in `e2e/tui-test.toml`, below.

### The terminal's colours, and no window

`e2e/tui-test.toml` (named by `TUI_TEST_CONFIG`) holds the person's terminal colours (the fireproof
theme: background, foreground, cursor and palette) and draws pictures with no title bar, shadow or
border and 16 px of padding. The site runner plays on the daemon backend, which reads that file, so
its media are the bare terminal. The in-process engine takes colours as an option instead (`lib/term.ts`
reads them from the same file) and has no config for the window, so the kit catalogue's screenshots
keep tui-test's window in the right colours. `kit/catalog/crops.ts` crops inside it, so its geometry
is unchanged.
