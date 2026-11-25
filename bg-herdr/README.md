---
tagline: "Each bg task as a read-only Herdr terminal: its state, its exit, and the live tail of its log."
featured: false
requires:
  - "A pi session inside a Herdr terminal (`HC_TERMINAL_ID`)"
  - "`hc`, the Herdr core CLI, on `PATH`"
  - "The `bg` plugin (`bg_run`, `bg_status`, `bg_stop`) in the same pi session"
order: 11
---

Long builds and test runs belong in the background, but a background task with no window is a task you have to ask about. This package puts one read-only Herdr child terminal beside your pi session for each task `bg` is running, so the output is already on screen when you look.

Each monitor shows the task's name and number, its lifecycle (`RUNNING`, `STOPPING`, `EXITED`, `FAILED`), how long it has run or how it ended, the command, its directory and the last lines of its log. A finished task keeps its terminal, so the reason a build failed stays readable until the task leaves the session.

The monitors only read. They never start a model, never send input to the task, and never stop or restart it: `bg_stop` in pi's session is still the way to end one. Herdr sees them as agents reporting a status, so they appear with the session they belong to: the terminal carries `fireproof.pi-agent-monitor`, `fireproof.pi-agent-name` and a lifecycle word, which is what Herdr's monitor row draws instead of a duplicate checkout row.

## Setup

Everything here is opt-in and absent by default: outside a Herdr terminal, or with `hc` missing, the package does nothing and pi behaves as before. Install it next to `bg` in the same pi session:

```jsonc
// ~/.config/pi/config.json (or however that pi session lists its packages)
{ "packages": ["…/bg", "…/bg-herdr"] }
```

Point `PI_BG_HERDR_HC` at an `hc` that is not on `PATH` if you keep the core client elsewhere. Nothing is written outside a private folder in `$TMPDIR`, which the session removes when it ends.

## Limits

- The monitor is a window, not a console: keystrokes in it go nowhere, and there is no way to stop a task from it.
- Logs are tailed, not scrolled: the monitor reads the last 16 KiB of the task's log file each poll, so older output is only in the file itself.
- A task's terminal follows the task's own lifecycle. If Herdr's core restarts, the monitors are re-created within a few seconds; the tasks themselves are untouched.
