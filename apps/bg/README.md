---
tagline: "`bg_run` and `bg_wait`: shell commands that outlive the tool call and never wake the agent."
featured: false
order: 11
---

pi only. A build, a test suite or a dev server lasts longer than a tool call should, so `bg_run` starts it detached and returns at once; the agent collects the result when it wants it.

| Tool        | What it does                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `bg_run`    | Start `bash -c <command>` in the cwd of the turn, and return its id and log path. Optionally end it after `timeoutSeconds`.                    |
| `bg_wait`   | Wait for one task to end, and return its exit code and the last 40 lines of its log. It waits 30 s, then hands the task back as still running. |
| `bg_status` | List this session's tasks, or take one id for its state and log tail                                                                           |
| `bg_stop`   | End one: SIGTERM to its process group, then SIGKILL if it has not gone after 5 s                                                               |

Subagents get the tools too, with tasks of their own.

## Nothing wakes the agent

A task that ends sends one message, and that message starts no turn. It is a custom message with `triggerTurn: false` and no `deliverAs`, which pi stores and draws: idle, it lands in the transcript at once; mid-turn, it is appended when the current turn ends. Either way no run is started for it, so a build that finishes twenty minutes later cannot make the agent do anything.

The agent asks for the result instead, with `bg_wait`, which returns the exit code and the tail of the log. It waits 30 seconds by default and then hands the task back as still running, so a hung build costs one call and no stuck turn: call it again, or `bg_status`, to look later. `bg_wait`'s own abort signal cancels the wait alone — the process keeps running, and the agent can come back to it.

## Logs and stopping

Each session gets a private folder, `pi-bg-<session-id>-<random>/` under the temp dir (`$TMPDIR`, `/tmp` by default), made on its first task with mode 0700; task `#1` writes `1.log` there. The output goes straight to the file, never through the agent's context, and `bg_run` reads back at most the last 40 lines, or 4 KB, of it. The folder outlives the session, so a transcript's log path still opens after it.

`bg_stop` signals a task's process group, which the task leads: its shell and everything the shell started. The pid is always one this session spawned — nothing signals a number the model typed. A task that ignores SIGTERM is killed after 5 seconds, and asking again kills at once.

`bg_run`'s `timeoutSeconds` ends a task the same way, for a dev server that should not outlive its use.

## What a session ends, and how

A session owns its tasks, and its end takes them with it: quitting, `/new`, `/reload` or a worktree move sends SIGTERM to every task and cancels their kill timers and waits. pi waits for that handler, so the shutdown then waits a second for the tasks to go, sends SIGKILL to whatever is left, and gives the kill a quarter of a second more. `/reload` and a quit therefore cannot orphan a task that ignores SIGTERM. The exits that follow reach nothing — a session that replaces it starts from `#1` with an empty list, and its completion messages never stand in for the old one's.

## Follow the tasks from another package

Every change is published on pi's shared event bus as one complete snapshot, so a package can follow this session's tasks without importing this one (Herdr's child terminals do):

- `bg:state`, the snapshot, on every change and once at session start.
- `bg:state:request`, answered with the current snapshot; the payload is ignored. A listener attached after startup asks once instead of waiting for a change.

```ts
{
  protocol: 1,
  sessionId: string,          // the session that owns the tasks
  instanceId: string,         // one per extension load; sequence numbers restart with it
  sequence: number,           // 1, 2, 3… within an instance
  type: "snapshot" | "stopped",
  tasks: [{
    id: number, name: string,
    pid: number | null,       // the leader of the task's process group
    path: string,             // its log file, absolute
    cwd: string, command: string,
    state: "running" | "stopping" | "exited" | "failed",
    code: number | null,      // after an exit; null after a signal
    signal: string | null,    // the signal that ended it, else null
    startedAt: number, finishedAt: number | null,
  }],
}
```

A snapshot replaces the previous one: a task that is gone is absent. A finished task stays in the list with its exit code until the session ends, which publishes `type: "stopped"` with no tasks. `running` and `stopping` mean the process group may still be alive; `failed` means it never started and has no pid. Everything but the numbers is text this package did not author — `name`, `command`, `cwd` and `path` come from the model — so a consumer that draws them should sanitize them.

## Moving off the `bg_run` this replaces

The nixos pi extensions' `bg_run` woke the agent with `{ deliverAs: "followUp", triggerTurn: true }`. That is the behaviour this package is built to remove: a completion on an idle session started a run, and one delivered as a follow-up could start a second turn after the agent had already finished. Differences, if you move:

- A completion no longer wakes anything; call `bg_wait` for the result, which waits 30 seconds and returns a still-running task instead of blocking a turn forever.
- `bg_wait`, `bg_status` and `bg_stop` replace `kill -- -<pid>`: ids belong to the session, and `bg_status` also shows a task that never started.
- Ids are per session instance rather than per session id, and each instance gets a fresh log folder, so a reloaded or resumed session cannot reopen a log its transcript still points at.
- Tasks are still killed on shutdown, and the shutdown now waits for it: SIGTERM, a second for them to go, then SIGKILL for the rest, before pi reloads or exits. A completion still cannot wake the agent; `bg_wait` is how the result comes back.
