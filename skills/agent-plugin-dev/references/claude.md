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
