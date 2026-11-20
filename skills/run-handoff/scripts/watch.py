"""One worker watchdog, or a foreground command with a finite activity lease.

The lead runs `watch` as a notifying background job. This process never calls a
model, restarts a worker, or kills it. `command` owns only the process group it
starts, and cleans it up on timeout or cancellation. State belongs outside git.
"""

import argparse
import fcntl
import hashlib
import json
import math
import os
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path

STATUSES = {"DONE", "DONE_WITH_CONCERNS", "NEEDS_CONTEXT", "BLOCKED"}


def positive(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("must be a finite positive number of seconds")
    return number


def save(path, value):
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_text(json.dumps(value) + "\n")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def git(cwd, *args):
    result = subprocess.run(
        ["git", "-C", str(cwd), *args], capture_output=True, timeout=10, check=True
    )
    return result.stdout


def snapshot(worktree):
    head = git(worktree, "rev-parse", "HEAD")
    paths = git(
        worktree, "ls-files", "--modified", "--others", "--exclude-standard", "-z"
    )
    changed = []
    for raw in sorted(set(paths.split(b"\0")) - {b""}):
        path = worktree / os.fsdecode(raw)
        try:
            stat = path.lstat()
            stamp = (stat.st_mtime_ns, stat.st_size, stat.st_ino)
        except FileNotFoundError:
            stamp = None
        changed.append((raw, stamp))
    return head, changed


def process_identity(pid):
    """PID plus birth time, so a recycled PID cannot inherit a command lease."""
    if sys.platform.startswith("linux"):
        try:
            fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
            return None if fields[0] == "Z" else f"linux:{fields[19]}"
        except (OSError, IndexError):
            return None
    result = subprocess.run(
        ["ps", "-p", str(pid), "-o", "lstart="],
        check=False,
        capture_output=True,
        text=True,
        timeout=2,
    )
    stamp = result.stdout.strip()
    return f"ps:{stamp}" if result.returncode == 0 and stamp else None


def activity(state, now):
    latest = 0
    leased = False
    for path in (state / "commands").glob("*.json"):
        record = json.loads(path.read_text())
        latest = max(latest, record["updated"])
        if (
            record["status"] == "running"
            and now < record["expires"]
            and record.get("identity") is not None
            and process_identity(record["pid"]) == record["identity"]
        ):
            leased = True
    return latest, leased


def emit(reason, **details):
    print(json.dumps({"reason": reason, **details}), flush=True)


def watch(args):
    state = args.state_dir.resolve()
    if state.is_relative_to(args.worktree.resolve()):
        raise ValueError("state must be outside the monitored worktree")
    state.mkdir(parents=True, exist_ok=True)
    # A resumed lead can re-arm the same attempt, but never reset its clock or
    # leave two watchers racing. The OS releases this lock if the lead kills us.
    with (state / "watch.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return watch_locked(args, state)


def watch_locked(args, state):
    worktree = args.worktree.resolve()
    attempt = state / "attempt.json"
    if attempt.exists():
        saved = json.loads(attempt.read_text())
        if saved["worktree"] != str(worktree):
            raise ValueError("attempt belongs to another worktree")
        started, expires, idle = saved["started"], saved["expires"], saved["idle"]
    else:
        started = args.started_at if args.started_at is not None else time.time()
        expires, idle = started + args.deadline, args.idle
        save(
            attempt,
            {
                "worktree": str(worktree),
                "started": started,
                "expires": expires,
                "idle": idle,
            },
        )
    if args.prepare_only:
        emit("prepared", started=started, expires=expires, state_dir=str(state))
        return 0
    progress = state / "progress.json"
    saved_progress = json.loads(progress.read_text()) if progress.exists() else {}
    last_progress = saved_progress.get("at", started)
    previous = saved_progress.get("fingerprint")
    previous_report = None
    while True:
        now = time.time()
        if not worktree.is_dir():
            emit("missing_worktree", worktree=str(worktree))
            return 2
        report = worktree / ".handoff-report.md"
        try:
            # One stat: a report removed between two calls would raise and end the watch.
            seen = report.stat()
        except FileNotFoundError:
            seen = None
        if seen is not None and seen.st_mtime >= started:
            stamp = (seen.st_mtime_ns, seen.st_size)
            # A stable report avoids waking on its first, partly written line.
            if stamp == previous_report:
                with report.open() as source:
                    status = source.readline(128).strip()
                if status not in STATUSES:
                    emit("invalid_report", path=str(report))
                    return 2
                emit("report", status=status, path=str(report))
                return 0
            previous_report = stamp
        else:
            previous_report = None
        try:
            current = hashlib.sha256(repr(snapshot(worktree)).encode()).hexdigest()
        except (OSError, subprocess.SubprocessError):
            if worktree.is_dir():
                raise
            # The worktree vanished between the check above and git reading it.
            emit("missing_worktree", worktree=str(worktree))
            return 2
        if previous is not None and current != previous:
            last_progress = now
        updated, leased = activity(state, now)
        last_progress = max(last_progress, updated)
        if previous != current or saved_progress.get("at") != last_progress:
            saved_progress = {"at": last_progress, "fingerprint": current}
            save(progress, saved_progress)
        previous = current
        elapsed = max(0, now - started)
        if now >= expires:
            emit("deadline", elapsed=round(elapsed, 2), worktree=str(worktree))
            return 124
        if not leased and now - last_progress >= idle:
            emit("idle", idle=round(now - last_progress, 2), worktree=str(worktree))
            return 124
        time.sleep(min(args.interval, max(0.001, expires - now)))


def stop_group(child):
    # The leader may already have exited while a grandchild is still alive.
    try:
        os.killpg(child.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        child.wait(timeout=1)
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    child.wait()


def command(args):
    argv = args.command
    if argv[:1] == ["--"]:
        argv = argv[1:]
    if not argv:
        raise ValueError("command requires an argv after --")
    state = args.state_dir.resolve()
    attempt = state / "attempt.json"
    if not attempt.exists():
        raise ValueError(
            "attempt is not prepared; lead must run watch --prepare-only first"
        )
    commands = state / "commands"
    commands.mkdir(parents=True, exist_ok=True)
    now = time.time()
    expires = min(now + args.timeout, json.loads(attempt.read_text())["expires"])
    if expires <= now:
        emit("deadline", message="item deadline already expired")
        return 124
    path = commands / f"{uuid.uuid4().hex}.json"
    identity = process_identity(os.getpid())
    if identity is None:
        raise ValueError("cannot identify command wrapper process")
    record = {
        "pid": os.getpid(),
        "identity": identity,
        "status": "running",
        "updated": now,
        "expires": expires,
    }
    child = None
    old_handler = signal.getsignal(signal.SIGTERM)

    def cancelled(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, cancelled)
    try:
        child = subprocess.Popen(argv, cwd=args.cwd, start_new_session=True)
        save(path, record)
        try:
            result = child.wait(timeout=max(0.001, expires - time.time()))
            return result if result >= 0 else 128 - result
        except subprocess.TimeoutExpired:
            emit("command_timeout", seconds=args.timeout)
            return 124
    except KeyboardInterrupt:
        return 130
    finally:
        # Do not let a command's background children outlive its lease.
        if child is not None:
            stop_group(child)
        record.update(status="finished", updated=time.time())
        save(path, record)
        signal.signal(signal.SIGTERM, old_handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    monitor = commands.add_parser(
        "watch", help="wait for report, no-progress threshold or deadline"
    )
    monitor.add_argument("--state-dir", type=Path, required=True)
    monitor.add_argument("--worktree", type=Path, required=True)
    monitor.add_argument("--idle", type=positive, default=600)
    monitor.add_argument("--deadline", type=positive, default=3600)
    monitor.add_argument(
        "--started-at", type=positive, help="dispatch Unix timestamp, not watcher start"
    )
    monitor.add_argument("--interval", type=positive, default=5)
    monitor.add_argument(
        "--prepare-only",
        action="store_true",
        help="record attempt before dispatch; do not wait",
    )
    run = commands.add_parser(
        "command", help="foreground command with timeout and activity lease"
    )
    run.add_argument("--state-dir", type=Path, required=True)
    run.add_argument("--cwd", type=Path, required=True)
    run.add_argument("--timeout", type=positive, required=True)
    run.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    try:
        return watch(args) if args.action == "watch" else command(args)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        emit(
            "watch_error" if args.action == "watch" else "command_error",
            error=str(error),
        )
        return 2


if __name__ == "__main__":
    sys.exit(main())
