# pi extensions

pi's own docs are on disk for the pinned version (`sources.md` has the paths): read `tui.md` before drawing and `extensions.md` for events and tools. This file holds the choices and traps they don't.

An extension runs inside the host process, so the thing under test is a running session, not a function.

## Where things are drawn

- **Overlay** (`ctx.ui.custom(..., { overlay: true, overlayOptions })`). You choose `width` and `minWidth` (columns or `"N%"`), `maxHeight`, `anchor`, `margin`, `offsetX`/`offsetY`, and `visible(termWidth, termHeight)`. Give it a width class from `style.md`, as a cap, not a percentage that grows with the terminal.
- **In the editor's place** (`overlay: false`). For a form that replaces the input. Full width.
- **Widget** (`setWidget`), above or below the editor. A few lines of chrome.
- **Status and footer** (`setStatus`, `setFooter`).
- **Renderers** for a tool's call and result, a message, an entry.

## Layout

`render(width)` returns lines, and pi throws on a line wider than `width`. Every gap, column and cap is yours to compute, which is why the kit exists. Build on pi-tui before writing string arithmetic:

- Components: `Box`, `Container`, `VStack`, `HStack`, `Spacer`, `Text`, `TruncatedText`, `Markdown`, `Input`, `ScrollView`, `SelectList`, `SettingsList`, `Loader`, `MouseRegion`.
- Text: `visibleWidth`, `truncateToWidth`, `wrapTextWithAnsi`, `sliceByColumn`. Measure with these, never `.length`.
- Matching: `fuzzyFilter`, `fuzzyMatch`. Keys: `Key`, `matchesKey`.

pi has no tab bar, table or key-hint bar; its own examples build them by hand each time. Those belong in the kit.

Colours come from the theme by role (`theme.fg("dim", …)`), never a literal.

## When something is wrong

| Symptom                                 | Look at                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Extension absent, or a conflict warning | `cap` at startup. `[Extension issues]` names the file and the exact conflict                                                               |
| Tool never called                       | `digest`: is it in the declared set? Is `exposure` what you expect? A `hidden` tool is registered and unreachable                          |
| Tool called, wrong result               | `digest` pairs `toolCall` with `toolResult`; an `isError` result with no thrown error means `execute()` returned rather than threw         |
| Renders wrong                           | `sweep`, and read the PNGs                                                                                                                 |
| Works in the TUI, breaks headless       | Re-run with `--mode rpc`. `ctx.ui.custom()` returns `undefined` there, `getTheme()` returns `undefined`, `setEditorComponent()` is a no-op |

`scripts/digest.py <session file>` flattens a session file into what it recorded: declared tools, calls, results, entries, cost. It can't see a tool that was registered but never declared; that is a `pi.getAllTools()` question, asked from inside the extension. It shows that a tool ran, not whether the model had a fair chance of picking it; that needs one real prompt.

## Traps

These pass a casual look and break in use:

- Processes, sockets, watchers and timers started in the factory instead of `session_start`. Some invocations load extensions without starting a session.
- Cleanup that is not idempotent in `session_shutdown`, or missing. Reload, cancellation, session replacement and exit all converge there.
- Module-level mutable state across `ctx.reload()`. Everything after `await ctx.reload()` runs in a new runtime.
- Theme-coloured strings cached without `invalidate()`. A theme change clears render caches but can't recolour strings already held in state.
- Branch state rebuilt from every entry. Use `ctx.sessionManager.getBranch()`, or a fork shows state from an abandoned branch.
- `pi.setActiveTools()` with names not registered yet. Unknown names are ignored silently.
- `ctx.ui.custom()` without a `ctx.mode === "tui"` guard.
- `content` and `details` confused: `content` is model-facing, `details` rebuilds state. `undefined` is a valid `details`.
- After a resize pi leaves old rows on screen outside an overlay. A scenario's `region` crops them out of a snapshot; they are still on the person's screen.
- An overlay gets mouse events only where the component handles them. A click that does nothing in a scenario usually means no handler, not a broken driver.

## Driving a session

- The session is `pi-dev`: the extensions from their checkout. It does not reload on a save: `goto` again after an edit.
- `start.turns` replays canned assistant turns, one entry per turn, consumed in order: `text`, `thinking`, `toolCall` or `error`. Malformed arguments are the point: they exercise validation and error paths without a model.
- The session file is under the run folder (`E2E_KEEP=1` keeps it after a test); give it to `digest.py`.
