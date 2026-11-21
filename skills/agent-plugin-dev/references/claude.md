# Claude Code mods

Use `plugin-authoring` for the installed version or the [offline mod manuals](upstream.md#claude-code). For manifests and type setup, see [Development](../../../docs/development.md#change-or-add-a-plugin).

## Panes, bands, and focus

- Draw a pane to `e.props.bodyColumns` and `e.props.scroll.bodyRows`. Claude chooses whether it docks or goes inline. If a pane opens on a wide terminal but not a narrow one, check whether it was opened on the user's action or by background work. The [pane manual](upstream/claude/mods-interface.md#when-a-pane-waits-for-a-wider-terminal) describes the width thresholds.
- A band (`AbovePrompt`) doesn't own the keys until it has focus. Test shortcuts with a draft in the prompt. If opening a pane replaces the band, hide the band **before** `$.ui.open` so the inline render uses the right space.
- Terminal button focus follows the button's position across redraws. Keep the button order stable while focus moves. A click can press a button without moving the keyboard focus.
- Closing a pane from the mod skips that mod's own `ui.close` hook. Do the submit or cleanup work before calling `$.ui.close`, as [docfix](../../../plugins/docfix/claude/register.tsx) does.
- Keep state writes out of `ui.render`. If a mod shows nothing, check the session's debug log for rejected hooks or element trees. To send `Escape` then a letter in a terminal replay, put a short delay between them so the host doesn't read the sequence as Alt+letter.

## The kit's own focus and hover on the terminal

The engine draws focus and hover its own way, and the [kit's painter](../../../kit/paint/claude.tsx) works round each. These were observed in Claude Code 2.1.325; recheck them after upgrading.

- The engine inverts the `Button` its focus ring rests on. To show the kit's pointer and bold label instead, keep the ring on a zero-size button (`ring`) and turn its moves into your own focus in a `ui.focus` hook (`ringMove`), answering `next({ ...e, element: RING.park })`. The site then owns the focus order of everything in it.
- The engine inverts a `Button` under the pointer too. The painter gives a control's runs a `hover` with their colours swapped, so the inversion puts them back and the row sits on a fill. A `hover` on a `Text` outside a keyed `Box` makes the engine refuse the whole tree.
- A plain `Button` with a `hotkey` prints `a: ` before its label. Bind letters on zero-size buttons instead. They are focus stops, so the same `ui.focus` hook has to move the ring off them.
- The transcript keeps no focus ring. A card placed there takes its keys from the band, sharing one state with it.
- A click on a transcript row hands the keyboard to the prompt, and `$.ui.focus` cannot take it back. Escape hands it back with no event at all. A mod hears the keyboard arrive (`ui.focus` in its site) and leave by typing (`prompt.edit`, `prompt.change`) or by a transcript click (`ui.press` on a `Placed`). Draw `keysHint` so the person can see where their keys go.
- `$` may only be passed to a function declared at the top of the file or imported from the mod's own files. A helper defined inside `register` that takes `$` stops the mod from loading.

## Graphical surfaces

Use the [kit](../../../kit/README.md) for Desktop and VS Code. Pass the render event to `kitOf(els, e)`; use `tui` and `gui` options for variations on one component. When a terminal layout needs a separate rendering, use `forSurface` with a kit-built GUI branch. [linear-issue](../../../plugins/linear-issue/claude/register.tsx) has an example.

These quirks were observed in the VS Code extension at 2.1.327. Recheck them after upgrading:

- A `Button` label doesn't wrap. `dimColor`, not `variant`, makes the button quiet in the versions tested. A long label can overflow a narrow pane.
- An `Input` is one line. Clicking a button that reveals an input doesn't necessarily focus it; test Tab and typing. `wait` can't see placeholder text. For scripted native inputs or selects, use the setter and dispatch the corresponding event, as in [linear-issue's VS Code scenarios](../../../e2e/linear-issue/vscode.scenarios.ts).
- Typing doesn't emit the terminal's prompt-edit events or redraw the band. The band redraws only when its props change: a turn starts or ends, or the prompt box changes width. A band that reads `$.prompt.read()` when it renders can stay blank or stale until then. See the [replay guide](../../../e2e/README.md#vs-code) for a resize workaround.
- `$.ui.scroll` can't jump to an element inside an `AssistantMessage` the mod renders: the call is denied or does nothing. Don't offer a transcript jump control that depends on it.

## Test a mod

Use `await $.ui.mount({ ...PANE, surface })` for `vscode` and `desktop`. Exercise actions with `ui.press({ key })` and call the kit's `expectNative` from `./checks`. This tests the element tree, not how the host closes a pane or transfers focus. Use the VS Code driver below and check [Desktop](../../../e2e/README.md#claude-desktop) by hand.

If a wrapper injects flags before `plugin test` and Claude reports “not run from this spelling,” use the dev shell's Claude binary:

```bash
test_home=$(mktemp -d)  # keep test config out of your real home
nix develop -c bash -c 'cd plugins/docfix && HOME="$1" claude plugin test .' -- "$test_home"  # test one mod
```

### Looking at a graphical screen

Run from the repo root with the [VS Code driver prerequisites](../../../e2e/README.md#vs-code). Inspect the real narrow and wide layouts before lifting any height caps. The full-height shot shows the contents below the scroll edge, not what fits on screen.

```bash
out=$(mktemp -d)                                      # keep screenshots together
node e2e/vscode.ts goto docfix open --size 420x800      # open the narrow panel with evidence expanded
node e2e/vscode.ts shot "$out/narrow.png"               # check wrapping, clipping and scroll
node e2e/vscode.ts resize 1280 720                      # switch to the wide layout
node e2e/vscode.ts shot "$out/wide.png"                 # check the wide panel before changing its CSS
node e2e/vscode.ts resize 420 1500                      # return to a narrow viewport with extra height
node e2e/vscode.ts eval '(() => { const s = document.createElement("style"); s.textContent = "[class*=paneBody_],[class*=abovePrompt_],[class*=band_]{max-height:none!important}"; document.head.appendChild(s); })()'  # lift caps in this webview only
node e2e/vscode.ts shot "$out/full.png"                 # inspect content below the usual scroll edge
node e2e/vscode.ts stop                                # close the test window
```
