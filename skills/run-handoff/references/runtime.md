# Bounded worker supervision

Use the bundled `scripts/watch.py` with Python 3. It watches git-visible changes and finite foreground-command leases, without model calls or periodic messages. It never restarts or kills a worker. The lead owns recovery.

## Arm each attempt

Resolve `watch` to the absolute path of this skill's `scripts/watch.py`, not a file copied into the project. Put runtime state outside the worktree, under the plan's `runtime/<item>/<attempt>/`; the helper refuses state inside the worktree because its own writes would count as progress. Record that path, dispatch Unix timestamp, worker ID (pi: name), worktree, budgets and recovery count in `PROGRESS.md`. The watcher is keyed to the worktree and the fixed `.handoff-report.md`, not to the harness's worker: it stats that file and reads its first line for the status, so nothing about pi-agents' store is involved. In pi a name addresses the agent for `agent_send`, `agent_wait` and `agent_stop` only, so a name that no longer resolves is not a way to resume a report: recover from the worktree, git and the report, and dispatch a fresh worker if the attempt needs one.

Before dispatch, prepare the attempt so the worker cannot run before an attempt clock exists:

```bash
python3 "$watch" watch --prepare-only --worktree "$worktree" --state-dir "$runtime" \
  --started-at "$dispatch_timestamp" --idle 600 --deadline 3600
```

Then dispatch the worker, and launch the watch as a notifying background command in the **lead**: Claude Code's background Bash; pi's `bg_run`. A detached shell with no completion notification is not enough.

```bash
python3 "$watch" watch --worktree "$worktree" --state-dir "$runtime" --idle 600 --deadline 3600
```

The second invocation reuses the attempt's original start, deadline and idle threshold. Start the clock at dispatch, not when you later remember to inspect the item. Substitute HANDOFF's explicit budget overrides. The defaults are ten minutes without progress and sixty minutes per attempt, not twice test duration. Git probes themselves time out after ten seconds.

On a lead resume, re-arm the **same** attempt directory: its original deadline is preserved and a duplicate live watcher is refused. If the old watcher is still running, retain it instead. A new directory is for a real new attempt, not a way to renew the clock. Resume does not reset the item's one-recovery allowance.

Before a new attempt, read and retire any old `.handoff-report.md` into the old attempt directory; otherwise it looks like a new report. Never retire the report merely to re-arm an existing attempt.

## Foreground commands

Give the worker the absolute script and attempt-directory paths. It runs long commands in the foreground through the helper:

```bash
python3 "$watch" command --state-dir "$runtime" --cwd "$worktree" \
  --timeout 600 -- pnpm test --filter affected-package
```

Use the repo's actual command and its measured timeout, not this example. The helper caps it at the recorded attempt deadline, preserves its exit code, and terminates the process group it started on timeout or cancellation. Commands that deliberately detach into a different session still require the lead's process inspection.

The activity lease prevents a live command within its finite timeout from being mistaken for an idle worker. A dead wrapper or expired lease does not suppress the watchdog. Command start and finish count as activity; merely having a process somewhere in the worktree does not.

## Handle one completion

The watcher emits one JSON result and exits. The harness's background-job notice wakes the lead.

- `report`, exit 0: read the report. In Claude Code, retrieve the worker's final result with a bounded wait first; in pi the result is the agent's message and starts a turn, and a result fetched with `agent_wait` doesn't arrive as a message as well. File presence alone is not proof of completion or acceptance. A report older than the attempt is ignored, but still retire it before a new attempt.
- `idle` or `deadline`, exit 124: inspect the worker, commits, changed files and command processes once. Stop an over-deadline attempt and its launched processes before recovery. A worker message is not an immediate stop.
- `missing_worktree`, `invalid_report` or `watch_error`, exit 2: supervision failed; inspect and repair it rather than assuming the worker passed.

For the first stalled attempt, recover once by continuing the existing worker or replacing a dead one, preserving its work. Only do so after ruling out duplicate processes. Use a fresh attempt directory and record recovery count 1. If it stalls again, mark that item blocked, notify the user and continue independent work. Do not reset the recovery count on a context reset or send-back.

Stop or drain the old watcher before another attempt. A report may arrive before the worker exits; never treat the watcher's exit as the worker's report. Keep harness joins bounded by the remaining attempt deadline, with an individual wait no longer than sixty seconds (pi: `agent_wait` with a `timeout`). If a short wait expires, end the turn and rely on the result messages and the watchdog, not a polling loop.

After worker completion or blocking, stop any remaining watcher before removing the worktree. A shutdown, worktree move or crash can cancel harness-owned background jobs; reconcile and re-arm them on resume. Runtime state is for recovery, not an always-on daemon.
