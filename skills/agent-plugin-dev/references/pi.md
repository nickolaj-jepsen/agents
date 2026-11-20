# pi extensions

For the API use the installed pi's `docs/extensions.md` and `docs/tui.md`, or the [offline manuals](upstream.md#pi). For plugin wiring and types, see [Development](../../../docs/development.md#change-or-add-a-plugin).

## Debug a session

Use the [terminal driver](../../../e2e/README.md#drive-a-parked-terminal-session). If the extension is missing, check startup `cap` for `[Extension issues]`. Run `goto` again after edits; saving doesn't reload the extension.

The driver prints the run folder. Look in its `sessions/` directory for the session JSONL. After a snapshot test, use `E2E_KEEP=1` to retain it.

```bash
python3 skills/agent-plugin-dev/scripts/digest.py /path/to/session.jsonl  # show declared tools, calls and results
```

If a registered tool is missing from the recorded prompt, inspect its exposure and active state in the extension. The session file doesn't list tools that were never declared.

## Runtime traps

- Guard terminal-only UI with `ctx.mode === "tui"`. RPC can still have `ctx.hasUI` for dialogs but can't mount a terminal component.
- Start session-owned timers or watchers at `session_start` and clean them up at `session_shutdown`. Loading an extension doesn't mean a session started.
- Restore persisted state from `ctx.sessionManager.getBranch()`, not the whole session file. See [answer's restore code](../../../plugins/answer/pi/index.ts) for a draft that follows branches.
- A component's `render(width)` must fit in terminal cells, not JavaScript string length. Use the [kit](../../../kit/README.md) or pi-tui's width helpers. If an overlay doesn't respond to clicks, check its mouse handler before blaming the driver.
