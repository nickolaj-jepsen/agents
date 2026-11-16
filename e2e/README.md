# e2e

End-to-end tests for plugin screens, in the real Claude Code and the real pi.
They are local only: `npm test`, the nix build and `just check` never run them.

One scenario is one named screen of one plugin: the fixture, how the agent starts,
and the steps that reach the screen. The same file feeds two things:

- `npm run e2e` plays every scenario and compares its screen with a stored snapshot.
- `goto` parks a live session on a scenario so you can keep driving it by hand.

The engine is [tui-test](https://github.com/microsoft/tui-test) with its Ghostty
backend. Tests run it in-process under vitest. `goto` uses its CLI daemon, which
keeps a session alive between invocations (`pkgs/tui-test`).

## Write a scenario

Add `e2e/<plugin>/claude.scenarios.ts` or `pi.scenarios.ts`. Copy
`docfix/claude.scenarios.ts`.

```ts
import { region } from "../lib/screen.ts";
import { scenarios } from "../lib/scenario.ts";

export default scenarios({
  plugin: "docfix",
  harness: "claude", // or "pi"
  region: region.any(region.sidebar, region.box(/seen \d+×/)),
  mask: [],
  scenarios: {
    queue: {
      about: "one line, shown by `ls`",
      setup: (ctx) => {
        /* fill ctx.cwd: ctx.write, ctx.git, ctx.initRepo */
      },
      start: { args: [], env: {}, turns: [] }, // turns: pi only, a replayed model
      size: [160, 45], // where the steps run
      steps: [{ type: "/docfix" }, { press: "Enter" }, { wait: "Nothing to review" }],
      extreme: false, // true: snapshot at four sizes
    },
    marked: { from: "queue", steps: [{ click: "docs/hosts.md" }] }, // continues a scenario
  },
});
```

Steps: `type`, `paste`, `press` (`"Enter"`, `"Escape"`, `"Down"`, `"Ctrl+c"`, `"Alt+a"`),
`click`, `doubleClick`, `hover`, `wait`, `sleep`, `resize`, `run`. The pointer goes
to the middle of the visible text. Use `{ text, nth }` when it shows twice.
After each step the driver waits for the screen to stop changing.

The agent runs in its own empty folder under the temp dir, with the checkout's plugins:
`claude-dev --strict-mcp-config` and `pi-dev`. Claude is your
signed-in account, so send no prompts a screen does not need. Both can replay canned
turns with `start.turns` (`text`, `thinking`, `toolCall: {name, arguments}`, `error`).
For Claude that starts `lib/stub.ts`, a Messages API stub on a free 127.0.0.1 port for
that session only (`ANTHROPIC_BASE_URL`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`),
under your sign-in and without touching stored config; it never reads or logs headers
and is stopped with the session. A turn after the last gets "(stub: no more turns)";
an `error` is a 400, since Claude retries a 5xx and that eats the next turn.

The files of the fixture are yours to make. Never point a scenario at your real
store or repository.

## Snapshots

Every state is snapshotted at 70x24 and 160x45; with `extreme: true` also at 112x32
and 240x60. The session starts at `size` and is resized between snapshots. A scenario's `sizes` replaces them; the kit catalogue uses 70x60 for its narrow size (`e2e/kit/sizes.ts`).

A snapshot is the styled text of the plugin's own surface:

1. The `region` crops the screen. Helpers in `region`: `box(text?)` (a bordered
   box), `sidebar` (Claude's pane from 110 columns), `rows(from, to?)`, `rect(x, y, w, h)`,
   `full`, and `any(a, b)` for the first that is on screen. Or write
   `(grid) => ({ x, y, w, h }) | undefined`.
2. Masks cover what changes between runs. Built in: versions, costs, dates, clock and
   elapsed times, uuids, tmp paths. Add your own as `{ pattern, with }` at file or
   scenario level. The mask keeps the width of what it covers.
3. The file holds the rows of text, then each row's style runs (`2x58` is 58 cells
   of style 2, `.` is the default style), then a legend of what each id means.

Only the `.snap` files are committed. A PNG of the whole terminal is drawn for review, and a
run draws none unless you ask (`E2E_PNG=1`: a `.png` beside every snapshot) or a state
differs (then `*.actual.snap` and `*.actual.png` are left beside it) or a scenario's steps
fail (`<scenario>@failed.actual.png`). `sweep`, `shot` and `npm run catalog` draw PNGs too.
Git ignores every `.png` and `*.actual.*`.

Files live in `e2e/<plugin>/__snapshots__/<harness>/<scenario>@<cols>x<rows>.snap`.

## Run

```bash
npm run e2e                  # all scenarios
npm run e2e docfix           # one plugin
npm run e2e docfix -- -t queue
E2E_UPDATE=1 npm run e2e docfix   # accept what is on screen (or pass -u)
```

Read the diff of the `.snap` files before you commit an update; for the pictures run
`E2E_UPDATE=1 E2E_PNG=1 npm run e2e <plugin>` and open the PNGs.
`E2E_KEEP=1` keeps each run's folder under the temp dir.

## How a run goes

The scenarios of a run are played first, together, then the tests read what each came to.

- **Sessions side by side.** A pool of sessions per agent: `E2E_JOBS_CLAUDE`, `E2E_JOBS_PI`
  (or `E2E_JOBS` for both). The default is a quarter of the CPUs for Claude (at most 4) and
  half for pi (at most 8).
- **One session along a chain.** A scenario that continues another (`from`) plays in the same
  session when it can: the parent is snapshotted, then the child's own steps go on from where
  it stands. Where scenarios branch from one parent only one child continues the session; the
  others start again and replay the parent's steps. Give a scenario `reset: [steps]` that put
  the session back on the screen it started from (its parent's, or the fresh start) and its
  siblings take turns in one session: the kit catalogue is one session per agent that way.
  `fresh: true` always gets a session of its own, as does a scenario with its own `setup` or
  `start`.
- **A shared session must not change a snapshot.** A scenario that fails or differs in a
  shared session is run again alone and the difference is printed (`e2e: ... failed in the
  session of ...`): a leak between scenarios, which is a plugin bug to fix, not a snapshot to
  update.
- Claude Code now and then starts in its classic renderer ("fullscreen didn't finish
  starting last time"); that start is dropped and made once more, and the run says so.
- Before a Claude state is snapshotted the driver waits out `◐ medium · /effort`, which is shown
  for about nine seconds after a start and shifts the inline layout by a row at narrow sizes.
- After a step the driver waits for the screen to stop changing (300 ms, polled every 50),
  unless a `wait` step follows, which says what to wait for.

## goto

```bash
npm run e2e:cli -- ls docfix
npm run e2e:cli -- goto docfix queue [--harness pi] [--size 120x36]
npm run e2e:cli -- cap                    # the screen as text
npm run e2e:cli -- snap                   # the scenario's snapshot, as it is now
npm run e2e:cli -- keys Down Enter
npm run e2e:cli -- type "hello"           # or paste
npm run e2e:cli -- click "Apply"          # --nth 1, --double
npm run e2e:cli -- hover "Dismiss"
npm run e2e:cli -- wait "Nothing" 10
npm run e2e:cli -- resize 70 24
npm run e2e:cli -- shot [file.png]
npm run e2e:cli -- sweep                  # PNGs at all four sizes, paths printed
npm run e2e:cli -- stop
```

One session lives at a time; `goto` replaces it. Each verb prints the screen after it.
The CLI finds `tui-test` through `TUI_TEST_BIN`, then `PATH`, then builds
`.#tui-test` from this flake.

## Traps

- PNGs need fonts under `$HOME/.local/share/fonts`, which NixOS lacks. `lib/fonts.ts`
  links the ones fontconfig knows into a cache folder and swaps `HOME` for that one
  call. `goto`'s daemon is started with that `HOME` and the child gets the real one.
- The daemon's socket path must stay short, so it lives in `$XDG_RUNTIME_DIR/tt-e2e`.
- tui-test has no paste call: `paste` wraps the text in bracketed-paste escapes.
  `type` sends a newline as a raw `\n`.
- After a resize pi leaves old rows on screen outside its surface. The crop hides
  them, which is why every snapshot has a region.
- A test session is unset from a parent agent's `CLAUDE_CODE_*` variables, or the
  session would print "Transcript saving is off".

## Site media

The project site's videos and screenshots are played from the same engine, on a stubbed model, so a
run needs no sign-in and no model call and comes out the same each time.

```bash
just site-shots                  # every plugin with an e2e/<plugin>/site.scenarios.ts
just site-shots docfix answer    # only those
```

A run writes `site/media/<plugin>/`: `demo.mp4` and its poster `demo.png` (`demo-pi.*` for a second
harness's demo), a `<still>.png` per still, and `media.json` (the captions, sizes and paths, relative to
the repo root, that the site reads). The files are not committed: the Pages workflow records them
before every build, in the same shell as `just media` (`nix develop .#media`: the agents from this
flake's nixpkgs, the fonts, ffmpeg and hunspell, and nothing of the machine's). A plugin whose run fails keeps its old files; the failed screens are left in the
temp folder it names. `E2E_KEEP=1` and `SITE_JOBS=<n>` (scenarios side by side, default 2) work as in
the regression run. Needs `tui-test`, and `ffmpeg` for the video: without one on PATH the runner
builds nixpkgs' and clears `LD_LIBRARY_PATH` for it.

### Add a site scenario

`e2e/<plugin>/site.scenarios.ts`, never `claude.scenarios.ts` / `pi.scenarios.ts`: the regression
run reads those and these are not snapshots. Copy `docfix/site.scenarios.ts`.

```ts
export default site({
  plugin: "docfix",
  demo: {
    caption: "One sentence under the video.",
    project: "shop-api", // the folder's name, which the agent's header shows
    setup, // a regular scenario: setup, start, steps, size
    start: { hermetic: true, turns },
    prepare: [], // played before the recording starts
    steps: [slow("/docfix"), { press: "Enter" }, poster, { sleep: 2000 }], // recorded
  },
  stills: {
    queue: { caption: "…", setup, start, steps: [...], harness: "pi" /* default claude */ },
  },
});
```

- A plugin with both halves gives a demo per harness: `demo: [claudeDemo, { harness: "pi", … }]`,
  the first shown first.
- The demo is a tour of 15 to 40 seconds. Its poster is the last screen unless a `poster` step
  takes it earlier. `slow(text)` types a key at a time, `slowPress(key, n)` repeats a key at a pace a
  field that redraws on every key keeps up with.
- A still is the screen after its steps. Give a plugin with both halves at least one pi still.
- The default size is 120x34 (`SITE_SIZE`), which suits a column of 1000 to 1100 px.
- Nothing may be on screen that is not meant to be: no account, path of the person's, email or real
  repository. Look at the frames (`ffmpeg -i demo.mp4 -vf fps=1/3 …`) before committing.

### What makes it hermetic

- `start.hermetic: true` runs plain `claude` with every mod of the checkout (`start.plugins` narrows
  it), never the `claude-dev` wrapper, so the screens are the same on any machine; it gives Claude a config folder of its own (`lib/harness.ts`): onboarding done,
  the stub's API key approved, fullscreen, manual permissions, the keys the READMEs ask for, no
  hooks, status line, debug banner or account. pi gets its own agent folder and loads only
  `start.plugins` (`plugins/<name>`), no skills or context files, theme `dark`.
- The agent runs in `/tmp/s-<random>/<project>`, so its header shows no home folder.
- `start.bin` puts stand-ins first on PATH (git-menu's `gh`, which would otherwise ask GitHub).
- `claude-dev` / `pi-dev` are used with their checkout swapped for this one, so a session loads the
  plugins of the tree the run is in (a worktree's), also in the regression run.

### The model stub

`start.turns` is a list the stub serves to the main loop in order, as in a regression scenario. A
turn with `match: "text"` is not part of that list: it is served, once, to the request whose system
prompt or messages contain the text, so a side call that races the main loop (spellfix's Haiku
check, linear-issue's drafter and duplicate check) gets its own answer whatever the order. A
request nothing matches is answered as before ("Stub" for a side call without tools). `STUB_LOG=<file>`
appends a line per request (model, tool count, the start and end of what it says, never headers),
to find the text to match. The stub's safety rules stand: localhost, one session, no header is read.

Claude Code's built-in "You should know" side agent does not call the model through the stub (no
request of it reaches the stub, with the stub's key or with an account), so the card and the Learn
more flow of linear-issue cannot be played; the site shows `/linear` only.

### The fake Linear server

`lib/linear-mcp.ts` is a stdio MCP server written by hand (newline-delimited JSON-RPC, no
dependencies) that serves fixtures for the tools linear-issue calls: `get_user` with three teams,
`list_issue_statuses`, `list_issue_labels`, `list_projects`, `list_issues` (three open issues, one
of which `PLT-212` is a duplicate the stubbed check can pick), `save_issue` and `save_comment`.
Name it `linear` in `start.mcp` (`mcp: linearMcp`): linear-issue finds its server by a tool name
like `mcp__linear__save_issue`. A write is answered with a made-up key and recorded to
`linear-writes.jsonl` in the run's folder, and the site runner fails a scenario that made one.

### Budgets

Each `.mp4` is at most 1 MB and each `.png` at most 300 KB (the site's check enforces them). A
recording is drawn at twice an image's scale for the same zoom, so `VIDEO_ZOOM` is 0.5 and a 120x34
video is 1232x746 like its poster; `FPS` and `IDLE` (the longest quiet stretch kept, in seconds) are
in `lib/site.ts` too. A PNG over budget goes through oxipng; a video over budget fails the run with
its size: shorten the tour, or lower `FPS`. Colours, padding and window chrome (none) are in `e2e/tui-test.toml`: the terminal
background and palette of the person's theme.

### The terminal's colours, and no window

`e2e/tui-test.toml` (named by `TUI_TEST_CONFIG`) holds the person's terminal colours (the fireproof
theme: background, foreground, cursor and palette) and draws pictures with no title bar, shadow or
border and 16 px of padding. The site runner plays on the daemon backend, which reads that file, so
its media are the bare terminal. The in-process engine takes colours as an option instead (`lib/term.ts`
reads them from the same file) and has no config for the window, so the kit catalogue's screenshots
keep tui-test's window in the right colours; `kit/catalog/crops.ts` crops inside it, so its geometry
is unchanged.
