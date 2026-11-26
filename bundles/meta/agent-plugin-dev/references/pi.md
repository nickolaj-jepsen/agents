# pi extensions

For the API use the installed pi's `docs/extensions.md` and `docs/tui.md`, or the [offline manuals](upstream.md#pi). For plugin wiring and types, see [Development](../../../docs/development.md#change-or-add-a-plugin).

## Debug a session

Use the [terminal driver](../../../lib/tools/drive/README.md#drive-a-parked-session). If the extension is missing, check `pnpm drive terminal text` at startup for `[Extension issues]`. After an edit run `reload`; a parked session is not watched, so saving alone changes nothing.

The driver prints the run folder. Look in its `sessions/` directory for the session JSONL. After a snapshot test, use `pnpm drive test <package> --keep` to retain it.

```bash
python3 skills/agent-plugin-dev/scripts/digest.py /path/to/session.jsonl  # show declared tools, calls and results
```

If a registered tool is missing from the recorded prompt, inspect its exposure and active state in the extension. The session file doesn't list tools that were never declared.

## Runtime traps

- Guard terminal-only UI with `ctx.mode === "tui"`. RPC can still have `ctx.hasUI` for dialogs but can't mount a terminal component.
- Start session-owned timers or watchers at `session_start` and clean them up at `session_shutdown`. Loading an extension doesn't mean a session started.
- Restore persisted state from `ctx.sessionManager.getBranch()`, not the whole session file. See [answer's restore code](../../../apps/answer/src/pi.ts) for a draft that follows branches.
- A command cannot call a tool: `ctx.executeTool` exists only while a tool runs. To reach an MCP server from a command, run pi's MCP support a second time for that server alone, on a host that only keeps the tools it registers, as [linear-issue's bridge](../../../apps/linear-issue/src/pi/linear.ts) does. It reads the same `mcp.json` and stored sign-in.
- pi calls an `overlayOptions` function once, when the overlay opens, and reads the object it got at every render (pi 1.5.2). For a size or place that follows the terminal, return an object whose `width`, `maxHeight` and `margin` are getters, as [linear-issue's sheet](../../../apps/linear-issue/src/pi/sheet.ts) does.
- An overlay can stand on the prompt instead of covering it: anchor it `bottom-center` with a bottom margin of the rows the prompt and everything under it take. No API gives that number. pi's screen is one list of parts with the widgets above the prompt just before it, so mount a widget of your own and add up what the parts after its container render, as [`rowsFromPrompt`](../../../apps/linear-issue/src/pi/chip.ts) does. Fall back to the bottom edge when the list is not there. Draw the overlay with the kit's `sheet` and `foot: "none"`, so its sides run down to the prompt's rule.
- A widget takes the mouse through `handleMouse`, but never the keyboard. Give its buttons a click, and name the command that does the same for the keyboard. pi sends no event when the pointer leaves a component, so a hovered control stays lit until the pointer moves elsewhere inside it.
- pi-tui's `Editor` sizes itself: it shows at most 30% of `tui.terminal.rows` lines, five at least, between two rules of its own. To give it a set number of rows inside another component, hand it a stand-in for the `tui` whose `terminal.rows` answers for that many lines, and pad under its text. It only asks the `tui` for that and `requestRender`.
- pi-tui's `Input` has no way to place its cursor: `setValue` leaves it at the start. Send it `ctrl+e` after setting a value that is to be continued.
- A component's `render(width)` must fit in terminal cells, not JavaScript string length. Use the [kit](../../../lib/kits/README.md) or pi-tui's width helpers. If an overlay doesn't respond to clicks, check its mouse handler before blaming the driver.
