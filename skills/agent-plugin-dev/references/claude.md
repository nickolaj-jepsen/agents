# Claude Code mods

Load `plugin-authoring` for the API. This file holds what it does not: where the surface puts things, what the layout can't do, and the traps.

`claude plugin validate` and `claude plugin test` say a mod loads and its logic holds. They run against a fake engine, so they don't show where a pane docks, which keys reach it, or how it looks. A regression after a Claude Code upgrade shows only in a real session: run the scenarios.

## Where things are drawn

- **Pane.** The surface chooses its place; the mod can't. It docks beside the transcript from 110 columns in fullscreen and sits inline above the prompt otherwise. Docked width is a request: 24 columns to 45% of the terminal, and a width the person dragged wins. Draw to `e.props.bodyColumns` and `e.props.scroll.bodyRows`.
- A pane the person asked for (their command, prompt or press) opens at any width. One a mod opens on its own waits undrawn below 144 columns, or 110 once they have asked for that id. A press handler that opens the pane after an `await` can count as unasked.
- **Band** (`AbovePrompt`). A strip over the prompt, one per mod, stacked. It takes a full tree with buttons. The person can collapse it; read `e.props.isCollapsed`. It is capped at half the terminal's rows and scrolls beyond that. Use it for a form or anything that reads badly in a 48-column sidebar.
- **Status** (`$.ui.status`). One plain string per mod, under the prompt.
- **Placed** (`$.ui.place`). One row at the end of the transcript that scrolls away with it. Display only.

## Layout

- Elements: `Box`, `Text`, `Button`, `Input`, `Select`, `Link`, `Code`, `Markdown`. There is no list, table, divider, tabs, spacer or scroll element; the kit builds them.
- `Box` has flex direction, grow, shrink and wrap, `alignItems`, `justifyContent`, `gap`, `width`, `height`, `minWidth`, `minHeight`, margin and padding on every side, `borderStyle`, `overflow`. It has no `maxWidth` or `maxHeight`: compute a cap from `bodyColumns`.
- `Text` has `wrap`: `wrap`, `truncate-end`, `truncate-middle`, `truncate-start`. Use it, or the kit's `clamp`; never `.slice` a string.
- Measure in cells. `.length` is wrong for wide characters, and a guess like `label.length + 6` for a button's width breaks when the engine changes how it draws one.
- `Markdown` sizes tables and fences to the terminal, not the pane.
- `Input` takes a newline, as the prompt box does (shift+enter, alt+enter, ctrl+j), and `onSubmit` returns the text with newlines kept. Anything that draws or sends that text must expect several lines.

## Graphical surfaces

The desktop app and the VS Code extension draw the same tree with their own controls. `e.surface` is `terminal`, `desktop`, `vscode` or `mobile`; `kitOf(els, e)` reads it into `k.isNative`. The style is `style.md`, "Graphical surfaces".

### Drawing with the kit

- A mod never reads the surface. It says what it shows and what a press means; each kit function has a terminal drawing and a graphical one, and picks by `k.isNative`.
- What differs by surface is said in options: `{ tui, gui }`, with `desktop`, `vscode` or `mobile` to override `gui` on one surface. The kit merges them with `surfaceOf`. Examples in the kit today:
  - `paneTitle(k, title, count, { gui: { count, summary, actions } })`: the toolbar.
  - `actionBar(k, actions, { gui: { isHidden: true } })`: the terminal's action row, not drawn where the toolbar holds the actions.
  - `notice(k, text, status, { gui: { isHidden: true } })`: a terminal-only line; `gui.isCut` one line cut at the edge, `gui.isFlush` no inset of its own.
  - `prose(k, text, { gui: { isInset: true } })`: a pane's own block of prose, at the inset.
  - `foldedRow(k, { ..., meta, tone })`: a dim line under the folded text, and the line in a state's colour.
  - `statusBand(k, { ..., gui: { text, icon, tone, actions, isOneLine } })`: the count in words, more quiet actions, and everything on one line with the text cut.
  - `emptyState(k, text, { gui: { text } })`: a fuller sentence where there is room.
  - `choice(k, options, { gui: { layout: "row" } })`, `capped(k, items, { gui: { maxItems } })`, `stack(k, blocks, { gui: { gap: "sm" } })`.
  - `choice(k, options, { gui: { layout: "rows", onward } })`: one row per option, led by a Button of its `tag`; the chosen one of a single choice opens with its `body` and `onward` filled at its far edge. An option with a `field` is that control's row.
  - `paneTitle(k, "", undefined, { gui: { tabs, actions } })`: tabs at the line's start, the actions at its far edge.
  - `excerpt(k, { text, isOpen, onToggle })`: a passage cut to one dim line with `More`; the terminal draws it whole. `fieldRow(k, { icon, field })`: a field in a choice row's columns.
  - `list(k, groups, { gui: { isAll, onMore } })`, and a row's `gui.isDetailAtEnd`.
  - `card(k, { ..., onToggle })`: the graphical drawing calls `onToggle({ isAlone: true })`, and the mod opens that row alone.
- An option when the same content is said or placed differently: a shorter word, a part one surface leaves out, a layout. A new kit function when a screen needs a pattern the kit lacks; it gets both drawings, and its stories (`kit/README.md`).
- A plugin never draws a graphical pattern itself. If the kit's drawing is wrong for a screen, change the kit, run `just kit-sync`, and check every mod that uses it.
- Spacing is `tokens.gui.space` (down) and `tokens.gui.across` (across), as numbers. A step name is a whole line or none in VS Code.

These functions follow the style: `pane`, `paneTitle`, `section`, `card`, `foldedRow`, `list`, `listRow`, `labelled`, `labelledRow`, `fields`, `properties`, `editable`, `choice`, `actionBar`, `statusBand`, `capped`, `stack`, `facts`, `subhead`, `rule`, `indent`, `prose`, `notice`, `emptyState`, `icon`, `excerpt`, `fieldRow`. These still draw the older look, with step names: `entries`, `note`, `bandShell`, `buttonRow`, `gapOf`, `imageGallery`. Converting a mod starts with the kit functions it calls: bring their graphical drawing to the style, then the mod.

### The one door: `forSurface`

`forSurface(k, { tui, gui, desktop?, vscode?, mobile? })` runs the one drawing that belongs to the surface: `tui` on the terminal, else the surface's own slot, else `gui`. It is the only place a mod draws by surface itself, and it is an exception to the rule above.

- Use it only for a terminal screen the mod lays out to the cell (its keys in the labels, rows measured to fit a band) that no kit function draws, beside a graphical drawing made of kit functions. linear-issue's pane and band, answer's band and spellfix's band do this.
- A value only one surface has goes through it too, such as a digit hotkey that a graphical surface would draw as a chip (linear-issue's toolbar button).
- The `gui` side is still kit functions only. Never read `k.isNative` or `e.surface` in a mod to choose a drawing.
- Closing a door means moving the terminal drawing into a kit function with both drawings, then calling that.

### Tests

`claude plugin test` mounts a pane or band on any surface: `$.ui.mount({ ...PANE, surface: "vscode" })`. For each graphical surface (`desktop` and `vscode`):

- mount every state the terminal tests mount;
- press every keyed action with `ui.press({ key })`, and check what it did;
- call `expectNative(ui)` on each state. It is the kit's `kit/claude/checks.tsx`, which `just kit-sync` copies beside each mod's `ui.tsx`: import it from `./checks`. Pass `{ hotkeys: ["submit"] }` for the action-row buttons that may carry a hotkey.

- A test can't close a pane: a mounted pane has no close, as a person's close needs a session. Test what closing does through the code it runs, and the close itself in a session.

When `claude` on your PATH is a wrapper that adds `--plugin-dir` (a system config's), `plugin test` fails through it ("not run from this spelling"). Run the binary it wraps, with a throwaway home:

```bash
(export HOME=$(mktemp -d); cd plugins/<mod>; "$(dirname "$(command -v claude)")/.claude-wrapped" plugin test .)
```

### VS Code, as the extension draws it

Read from the extension's webview (2.1.327) and checked by screenshot:

- **Button.** Its look comes from `dimColor` alone: without it, a filled button in the theme's button colour; with it, a quiet outlined one. `variant` is ignored, so the kit sets `dimColor` on every button that is not the main one. A label never wraps and the button never shrinks, so a long one runs off the pane, even as a `Text` with `truncate-end` in a shrinking `Box`. Its children are strings and `Text` only: no `Svg`, no `Box`, and a `Text` child's colour is dropped (2.1.327). `role="dismiss"` draws a plain button, no close mark.
- **Link** is a plain link that opens its URL. It can't raise a press, so it can't be a mod's control.
- **Markdown links** with `onLinkPress` raise a press, but draw in the link colour, underlined: too loud for a row.
- **Box.**
  - `backgroundColor` takes a theme key, a hex colour (eight digits for alpha) or `rgb()`. The keys that paint: `text`, `secondaryText`, `subtle`, `background`, `error`, `success`, `warning`, `claude`, `suggestion`, `userMessageBackground` (the theme's second background), `bashMessageBackgroundColor` (the code background), `diffAdded`, `diffRemoved`.
  - Gaps, padding and `width` take fractions: a row gap is in lines, a column gap and a width in cells (`ch`). A Box `width={0.2}` with a fill is a thin rule as tall as its row. `minWidth` is in cells too (the kit's lead column). There is no `flexBasis`; `width={0}` with `flexGrow={1}` is a basis of nothing, which takes only the room its neighbours leave (a row's detail).
  - Any `borderStyle` is a 1-pixel border on all four sides; `round` also rounds the corners (6 pixels). There is no border on one side. For rounded corners with no border, set `borderColor="#00000000"`.
  - `hover` does nothing.
- **Text.**
  - `weight` `semibold` and `bold` draw bold; `medium` draws regular.
  - `size` and `mono` do nothing. A code span needs `Markdown`, or a `Text` with the code background (`tokens.gui.chip`).
  - `dimColor` is 65% opacity, so dim text inside a dim block fades twice.
  - `color` takes a theme key or a hex colour. A key is the theme's own foreground: `error` and `success` are red and green in Dark Modern, but `warning` is grey (`#bfbfbf`). Text that must read as a warning takes the kit's `tokens.gui.tone.warning`, the colour of its icon.
  - `wrap="truncate-end"` keeps one line and cuts it at the edge with `…`. `maxLines` cuts at a word and can leave the line short.
- **Svg** is an image of fixed size in CSS pixels, with a required `alt`. It can't read the theme or `currentColor`, so its colours are fixed.
- **Select** is the page's own `<select>`, its options in the platform's popup. It grows to fill what is left of its line (at least 8 characters), and its `label` is drawn before it on the same line, so names of different lengths start their selects at different places: set names in a column of their own (`fields`).
- **Input** shows one line, whatever `rows` says, and fills what is left of its line like a Select. `placeholder` draws. A pointer's click on the field focuses it, so a field always drawn is reached in one click (answer's write-in, 2.1.327). A click on a Button that reveals an `Input` leaves the focus on that Button: `autoFocus` and `$.ui.focus` don't move it there, and InputProps has nothing else for it; Tab reaches the field. With no `submitLabel`, or an empty one, the field has no button beside it, focused or not; with a word, a filled button of that word shows beside it, one more filled control in view, so leave it out. Enter submits either way.
- **The prompt.** VS Code raises no `prompt.edit` or `prompt.change`. A mod that watches the draft reads `$.prompt.read()` in its render hook. The band redraws only now and then while the person types, so what it shows can lag the draft by an edit or more.
- The inline pane's body is at most about 234 pixels tall in a 420 by 800 window, and scrolls. The band above the prompt is capped the same, at 234 pixels, and scrolls.

The desktop app is not checked: no driver reaches it. It reads the same props, and the kit's numbers are cells, which every surface sizes; confirm fractional spacing, the transparent round border and the theme keys there before relying on them.

### Looking at a graphical screen

The VS Code driver is `e2e/vscode.ts` (`e2e/README.md`, "VS Code"). Scenarios are `e2e/<plugin>/vscode.scenarios.ts`.

```bash
out=$(mktemp -d)
node e2e/vscode.ts goto docfix queue --size 420x800   # the real inline pane
node e2e/vscode.ts click Open                         # also: cap, hover, type, keys, wait, eval
node e2e/vscode.ts shot "$out"/queue-420.png
node e2e/vscode.ts stop
```

- Unset every inherited `CLAUDE*` and `ANTHROPIC*` variable first. Starting takes 20 to 30 seconds, and a change to the mod needs `stop` and `goto` again.
- Shoot each state at 420 by 800 (the real pane), at 420 "full", and at 1280 by 720 (docked). Open every PNG.
- For a full photograph, lift the inline pane's and the band's height caps in the page, then shoot at a taller size. The band's cap is on `[class*=band_]`, inside `[class*=abovePrompt_]`. This is for the photograph only, never the mod:

  ```bash
  node e2e/vscode.ts resize 420 1500
  node e2e/vscode.ts eval '(() => { const s = document.createElement("style"); s.textContent = "[class*=paneBody_],[class*=abovePrompt_],[class*=band_]{max-height:none!important}"; document.head.appendChild(s); })()'
  node e2e/vscode.ts shot "$out"/queue-420-full.png
  ```

- Check for horizontal overflow at 420 pixels. This lists what reaches past the webview's right edge, or says none does:

  ```bash
  node e2e/vscode.ts eval '(() => { const w = document.documentElement.clientWidth; const bad = [...document.querySelectorAll("*")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > w + 0.5; }).map((e) => e.tagName + " " + (e.textContent || "").trim().slice(0, 30)); return bad.length ? bad.slice(0, 5) : "no overflow"; })()'
  ```

- A click leaves the pointer where it landed, so a button under it shows its hover fill in the shot.
- `type` reaches the prompt, not a pane's `Input` focused from `eval`. To fill a field, set its value with the element's own setter and raise `input` (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set`, then `dispatchEvent(new Event("input", { bubbles: true }))`), as for a Select's `change`; linear-issue's scenarios do both.

## Traps

Checked live on 2.1.319 to 2.1.325:

- A letter typed while a band is showing goes to the prompt. A band's keys work only once it has focus (an `alt+a`-style chord, a click, or the person tabbing to it), so never offer a bare letter as the way in.
- Focus is asked for, not taken. After a press that reveals an `Input` with `autoFocus`, check in a session that typed keys reach it.
- A layout that reads well as a box over the transcript can be cramped as a sidebar. Design for both.
- A bare digit arms only the hotkeys of `Button`s wholly inside what is drawn, and a hotkey lives only while its `Button` is mounted. Keep the `Button` drawn if the key must always work.
- `$.command.register` throws for a name a built-in or a skill already has, and `validate` and `test` don't say so. Type the command in a session.

- **A focused `Button` is drawn inverse by the engine, and that can't be turned off.** A pointer (`❯`) the kit draws on the focused row would double it, so a Claude list has no pointer: the engine's ring is the selection (docfix, 2.1.325). A click presses a row and does not move the ring, so state keyed on focus follows Tab, not the mouse (docfix keeps what a row shows in its own state, which a click on the row's evidence line toggles).
- **The ring keeps its index among the Buttons across a redraw, not its key.** A Button that mounts or unmounts before the ring when the ring moves (keys shown only on the focused row, say) slides the ring onto a neighbour. Keep the number of Buttons the same whatever has focus, and move only their `hotkey` props (docfix, 2.1.325).
- **The ring can skip a Button.** No prop takes a Button out of the Tab and arrow order, but a `ui.focus` hook on the pane can answer `next({ ...e, element })` to land the ring elsewhere; compare with where it was to tell down from up (docfix's row keys). A hotkey pressed right after a move can reach the Button that held it before the redraw, so its press should act on where the ring is now.
- **The engine denies a state write inside a `ui.render` hook.** A render that finds stale state leaves the fix to a timer or the next event (spellfix, 2.1.327).
- **In a VS Code scenario**, `wait` reads the webview's text, which holds no `Input`'s placeholder: wait for a label near it. `Escape` leaves a field but does not hide a pane.
- **A mod's own `$.ui.close` skips its own `ui.close` hook** (the debug log says `skipped: re-entry`). A submit Button that closes the pane must do the closing work itself before it calls `close` (docfix, 2.1.325).
- A band that steps aside while a pane is up must do so before `$.ui.open`: hidden after it, the inline pane is placed against the old layout and now and then comes out two rows tall (docfix, 2.1.325).
- No hotkey can be space or Enter, and the engine presses a focused `Button` only on Enter, so a pane can't give space a job of its own (docfix, 2.1.325).
- A `Button`'s children are strings and `Text` only, so a row with metadata columns is one string padded with `cellWidth`, never a `Box` of cells. A `Pane`'s `backgroundColor: "transparent"` drops the stock grey fill; the inline box asks for `rows` and still gets about a third of the terminal.
- `kit/claude/ui.tsx` is copied into each mod: edit the source and run `just kit-sync`.

Seen in earlier versions, not re-checked; confirm with the driver before designing on one:

- A mod can't bind a plain arrow key. Arrows in a pane came from rebinding them in the `Pane` keybinding context and hooking `ui.scroll`.
- The fullscreen terminal opens only some URL schemes on a click.
- Prompt text can't be decorated.
- Enter in a text field clears it, and a field's `⏎ submit` hint can't be removed.
- A `SessionStart` command hook's output always carries its prefix and indent. Draw a band instead.

## Driving a session

- The session is `claude-dev`: every mod from the checkout, none of the installed copies, no MCP servers.
- It runs in an empty folder of its own. A mod that reads a repository gets one from the scenario's `setup` (`ctx.initRepo`, `ctx.write`), never the real checkout.
- `start.turns` replays canned turns through a stub on localhost. A turn is `text`, `thinking`, `toolCall` or `error`.
- In a key step, `Escape` followed at once by a letter is read as alt+letter. Put a `sleep` between them.
- The debug log in the run folder says what the engine did with the mod: loaded, a hook skipped, a tree refused, a reload after a save.
- The built-in cards (`You should know`) can't be made to appear on demand.
