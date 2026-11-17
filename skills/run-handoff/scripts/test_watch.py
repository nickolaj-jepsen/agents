"""Real subprocess tests for the watchdog; no model or harness is needed."""

import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from watch import process_identity

SCRIPT = Path(__file__).with_name("watch.py")


class WatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.worktree = self.root / "repo"
        self.worktree.mkdir()
        self.state = self.root / "state"
        self.env = {
            **os.environ,
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
        }
        self.git("init", "-q")
        self.git(
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "--allow-empty",
            "-qm",
            "initial",
        )

    def git(self, *args):
        return subprocess.run(
            ["git", "-C", str(self.worktree), *args],
            check=True,
            capture_output=True,
            env=self.env,
        )

    def start(self, *args):
        child = subprocess.Popen(
            [sys.executable, str(SCRIPT), *args],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=self.env,
        )
        self.addCleanup(
            lambda: child.poll() is None and (child.kill(), child.communicate())
        )
        return child

    def monitor(self, *extra, idle="0.2", deadline="2"):
        child = self.start(
            "watch",
            "--state-dir",
            str(self.state),
            "--worktree",
            str(self.worktree),
            "--idle",
            idle,
            "--deadline",
            deadline,
            "--interval",
            "0.02",
            *extra,
        )
        self.wait_for(self.state / "attempt.json")
        return child

    def prepare(self):
        child = self.start(
            "watch",
            "--prepare-only",
            "--state-dir",
            str(self.state),
            "--worktree",
            str(self.worktree),
        )
        self.assertEqual(self.result(child)[0], 0)

    def run_command(self, code, timeout="1"):
        if not (self.state / "attempt.json").exists():
            self.prepare()
        return self.start(
            "command",
            "--state-dir",
            str(self.state),
            "--cwd",
            str(self.worktree),
            "--timeout",
            timeout,
            "--",
            sys.executable,
            "-c",
            code,
        )

    def result(self, child):
        stdout, stderr = child.communicate(timeout=5)
        self.assertEqual(stderr, "")
        return child.returncode, [json.loads(line) for line in stdout.splitlines()]

    def wait_for(self, path):
        until = time.monotonic() + 3
        while not path.exists() and time.monotonic() < until:
            time.sleep(0.01)
        self.assertTrue(path.exists(), str(path))

    def test_idle_wakes_lead(self):
        code, output = self.result(self.monitor())
        self.assertEqual(code, 124)
        self.assertEqual(output[-1]["reason"], "idle")

    def test_stable_report_finishes_watch(self):
        child = self.monitor()
        (self.worktree / ".handoff-report.md").write_text("DONE\nAcceptance passed.\n")
        code, output = self.result(child)
        self.assertEqual(code, 0)
        self.assertEqual(output[-1]["status"], "DONE")

    def test_invalid_report_is_not_done(self):
        child = self.monitor()
        (self.worktree / ".handoff-report.md").write_text("looks good\n")
        code, output = self.result(child)
        self.assertEqual(code, 2)
        self.assertEqual(output[-1]["reason"], "invalid_report")

    def test_changes_reset_idle_but_not_deadline(self):
        child = self.monitor(idle="0.3", deadline="0.55")
        for n in range(5):
            (self.worktree / "progress").write_text(str(n))
            time.sleep(0.1)
        code, output = self.result(child)
        self.assertEqual(code, 124)
        self.assertEqual(output[-1]["reason"], "deadline")

    def test_finite_live_command_is_not_idle(self):
        child = self.monitor(idle="0.15")
        command = self.run_command("import time; time.sleep(.4)")
        self.assertEqual(self.result(command)[0], 0)
        (self.worktree / ".handoff-report.md").write_text("DONE\n")
        code, output = self.result(child)
        self.assertEqual(code, 0, output)

    def test_dead_command_lease_does_not_hide_idle(self):
        self.state.mkdir()
        commands = self.state / "commands"
        commands.mkdir()
        (commands / "dead.json").write_text(
            json.dumps(
                {
                    "status": "running",
                    "pid": 2**30,
                    "updated": time.time() - 10,
                    "expires": time.time() + 100,
                }
            )
        )
        code, output = self.result(self.monitor())
        self.assertEqual(code, 124)
        self.assertEqual(output[-1]["reason"], "idle")

    def test_missing_worktree_wakes(self):
        child = self.monitor()
        self.git("clean", "-fdq")
        self.worktree.rename(self.root / "moved")
        code, output = self.result(child)
        self.assertEqual(code, 2)
        self.assertEqual(output[-1]["reason"], "missing_worktree")

    def test_stale_report_is_ignored(self):
        report = self.worktree / ".handoff-report.md"
        report.write_text("DONE\nPrevious attempt.\n")
        old = time.time() - 10
        os.utime(report, (old, old))
        code, output = self.result(self.monitor())
        self.assertEqual(code, 124)
        self.assertEqual(output[-1]["reason"], "idle")

    def test_recycled_pid_does_not_keep_lease_alive(self):
        self.state.mkdir()
        commands = self.state / "commands"
        commands.mkdir()
        (commands / "recycled.json").write_text(
            json.dumps(
                {
                    "status": "running",
                    "pid": os.getpid(),
                    "identity": "previous-process",
                    "updated": time.time() - 10,
                    "expires": time.time() + 100,
                }
            )
        )
        code, output = self.result(self.monitor())
        self.assertEqual(code, 124)
        self.assertEqual(output[-1]["reason"], "idle")

    def test_expired_live_lease_does_not_hide_idle(self):
        self.state.mkdir()
        commands = self.state / "commands"
        commands.mkdir()
        (commands / "expired.json").write_text(
            json.dumps(
                {
                    "status": "running",
                    "pid": os.getpid(),
                    "identity": process_identity(os.getpid()),
                    "updated": time.time() - 10,
                    "expires": time.time() - 1,
                }
            )
        )
        code, output = self.result(self.monitor())
        self.assertEqual(code, 124)
        self.assertEqual(output[-1]["reason"], "idle")

    def test_state_inside_worktree_is_refused(self):
        child = self.start(
            "watch",
            "--state-dir",
            str(self.worktree / "state"),
            "--worktree",
            str(self.worktree),
        )
        code, output = self.result(child)
        self.assertEqual(code, 2)
        self.assertEqual(output[-1]["reason"], "watch_error")

    def test_command_requires_prepared_attempt(self):
        child = self.start(
            "command",
            "--state-dir",
            str(self.state),
            "--cwd",
            str(self.worktree),
            "--timeout",
            "1",
            "--",
            sys.executable,
            "-c",
            "raise SystemExit(99)",
        )
        code, output = self.result(child)
        self.assertEqual(code, 2)
        self.assertEqual(output[-1]["reason"], "command_error")
        self.assertFalse((self.state / "commands").exists())

    def test_concurrent_commands_have_independent_leases(self):
        watcher = self.monitor(idle="0.2")
        one = self.run_command("import time; time.sleep(.2)")
        two = self.run_command("import time; time.sleep(.5)")
        self.assertEqual(self.result(one)[0], 0)
        self.assertIsNone(watcher.poll())
        self.assertEqual(self.result(two)[0], 0)
        (self.worktree / ".handoff-report.md").write_text("DONE\n")
        self.assertEqual(self.result(watcher)[0], 0)
        self.assertEqual(len(list((self.state / "commands").glob("*.json"))), 2)

    def test_resumed_watch_sees_changes_while_it_was_down(self):
        first = self.monitor(idle="0.25")
        self.wait_for(self.state / "progress.json")
        first.terminate()
        first.communicate(timeout=3)
        time.sleep(0.2)
        (self.worktree / "changed").write_text("work continued")
        second = self.monitor()
        time.sleep(0.15)
        (self.worktree / ".handoff-report.md").write_text("DONE\n")
        self.assertEqual(self.result(second)[0], 0)

    def test_nonzero_command_exit_preserved(self):
        code, _ = self.result(self.run_command("raise SystemExit(7)"))
        self.assertEqual(code, 7)
        record = json.loads(next((self.state / "commands").glob("*.json")).read_text())
        self.assertEqual(record["status"], "finished")

    def test_timeout_kills_command_and_child(self):
        pidfile = self.root / "pid"
        code = f"import subprocess,sys,time; p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)']); open({str(pidfile)!r},'w').write(str(p.pid)); time.sleep(60)"
        child = self.run_command(code, timeout="0.25")
        self.wait_for(pidfile)
        result, output = self.result(child)
        self.assertEqual(result, 124)
        self.assertEqual(output[-1]["reason"], "command_timeout")
        pid = int(pidfile.read_text())
        # A killed grandchild may remain a zombie until the host's init reaps it.
        status = subprocess.run(
            ["ps", "-p", str(pid), "-o", "stat="],
            check=False,
            capture_output=True,
            text=True,
        ).stdout.strip()
        self.assertTrue(not status or status.startswith("Z"), status)

    def test_attempt_deadline_caps_command_timeout(self):
        self.state.mkdir()
        (self.state / "attempt.json").write_text(
            json.dumps({"expires": time.time() + 0.2})
        )
        code, output = self.result(
            self.run_command("import time; time.sleep(60)", timeout="60")
        )
        self.assertEqual(code, 124)
        self.assertEqual(output[-1]["reason"], "command_timeout")

    def test_cancel_command_cleans_up_lease(self):
        child = self.run_command("import time; time.sleep(60)")
        until = time.monotonic() + 3
        while (
            not list((self.state / "commands").glob("*.json"))
            and time.monotonic() < until
        ):
            time.sleep(0.01)
        child.send_signal(signal.SIGTERM)
        self.assertEqual(self.result(child)[0], 130)
        record = json.loads(next((self.state / "commands").glob("*.json")).read_text())
        self.assertEqual(record["status"], "finished")

    def test_duplicate_watch_refused(self):
        first = self.monitor(idle="2")
        code, output = self.result(self.monitor())
        self.assertEqual(code, 2)
        self.assertEqual(output[-1]["reason"], "watch_error")
        first.terminate()
        first.communicate(timeout=3)

    def test_resumed_watch_keeps_original_deadline(self):
        first = self.monitor(idle="2", deadline="0.4")
        saved = (self.state / "attempt.json").read_text()
        first.terminate()
        first.communicate(timeout=3)
        code, output = self.result(self.monitor(idle="10", deadline="60"))
        self.assertEqual(code, 124)
        self.assertEqual(output[-1]["reason"], "deadline")
        self.assertEqual((self.state / "attempt.json").read_text(), saved)

    def test_invalid_intervals_rejected(self):
        for value in ["0", "-1", "nan", "inf"]:
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "watch",
                    "--state-dir",
                    str(self.state),
                    "--worktree",
                    str(self.worktree),
                    "--idle",
                    value,
                ],
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 2)

    def test_dispatch_time_not_watcher_start_controls_deadline(self):
        code, output = self.result(
            self.monitor("--started-at", str(time.time() - 10), deadline="1")
        )
        self.assertEqual(code, 124)
        self.assertEqual(output[-1]["reason"], "deadline")


if __name__ == "__main__":
    unittest.main()
