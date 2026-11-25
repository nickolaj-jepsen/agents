#!/usr/bin/env python3
"""Tests for agents_ui.py, the ownership-aware deployer for Herdr's writable UI tree.

    python3 lib/tools/updates/python/test_agents_ui.py

No Nix and no Herdr: a temporary artifact (the store copy), a temporary config directory (the
app's `herdr-app`), and a temporary state directory (the ownership record). What the deployer
promises is about files, so the assertions are about files: which ones it wrote, which ones it
left exactly as they were, and which ones it removed.
"""

from __future__ import annotations

import importlib.machinery
import importlib.util
import json
import os
import shutil
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
MODULE_PATH = HERE / "agents_ui.py"


def load_module():
    loader = importlib.machinery.SourceFileLoader("agents_ui", str(MODULE_PATH))
    spec = importlib.util.spec_from_loader("agents_ui", loader)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    # dataclasses resolves annotations through sys.modules, so register before executing.
    sys.modules["agents_ui"] = module
    loader.exec_module(module)
    return module


agents_ui = load_module()


class Recorder:
    """The console the CLI passes down: two streams the tests can read back."""

    def __init__(self):
        self.lines = []
        self.warnings = []

    def say(self, message=""):
        self.lines.append(message)

    def warn(self, message):
        self.warnings.append(message)


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


class DestinationTest(unittest.TestCase):
    def test_herdr_ui_goes_to_the_apps_config_dir(self):
        env = {"XDG_CONFIG_HOME": "/home/u/.config"}
        self.assertEqual(
            agents_ui.destination("herdr-ui", env), Path("/home/u/.config/herdr-app")
        )

    def test_config_home_falls_back_to_home(self):
        self.assertEqual(
            agents_ui.destination("herdr-ui", {"HOME": "/home/u"}),
            Path("/home/u/.config/herdr-app"),
        )

    def test_agents_ui_dir_wins_for_any_name(self):
        env = {"XDG_CONFIG_HOME": "/home/u/.config", "AGENTS_UI_DIR": "/tmp/tree"}
        self.assertEqual(agents_ui.destination("herdr-ui", env), Path("/tmp/tree"))
        self.assertEqual(agents_ui.destination("other-ui", env), Path("/tmp/tree"))

    def test_an_unknown_target_without_an_override_is_refused(self):
        with self.assertRaises(agents_ui.DeployError):
            agents_ui.destination("other-ui", {"HOME": "/home/u"})


class SafeRelativeTest(unittest.TestCase):
    def test_accepts_the_artifacts_paths(self):
        for relative in ("mods/nested-spaces/main.js", "layouts/nested.json"):
            self.assertEqual(agents_ui.safe_relative(relative), relative)

    def test_refuses_escapes_and_foreign_folders(self):
        for relative in (
            "",
            "/etc/passwd",
            "../x",
            "mods/../../x",
            "mods/./main.js",
            "mods//main.js",
            "other/x.json",
            "mods",
            "shared.json",
        ):
            with self.subTest(relative=relative):
                with self.assertRaises(agents_ui.DeployError):
                    agents_ui.safe_relative(relative)

    def test_a_nul_byte_is_refused(self):
        with self.assertRaises(agents_ui.DeployError):
            agents_ui.safe_relative("mods/a\0b.js")


class Fixture(unittest.TestCase):
    """A store-shaped artifact, a config directory and a state directory."""

    def setUp(self):
        self.temporary = Path(tempfile.mkdtemp(prefix="agents-ui-test-"))
        self.addCleanup(shutil.rmtree, self.temporary, ignore_errors=True)
        self.console = Recorder()
        self.source = self.temporary / "artifact"
        self.destination = self.temporary / "config" / "herdr-app"
        self.state = self.temporary / "state"
        self.artifact(
            {
                "mods/demo/main.js": "// main\n",
                "mods/demo/mod.json": '{"place": "none"}\n',
                "mods/demo/helper.js": "export const helper = 1;\n",
                "mods/demo/mark.svg": "<svg/>\n",
                "mods/other/main.js": "// other\n",
                "mods/other/mod.json": '{"place": "none"}\n',
                "layouts/nested.json": '{"id": "root"}\n',
            }
        )

    def artifact(self, files, root=None):
        root = root or self.source
        for relative, text in files.items():
            write(root / relative, text)
        return root

    def deploy(self, dry_run=False, source=None, destination=None):
        return agents_ui.deploy(
            "herdr-ui",
            source or self.source,
            destination or self.destination,
            self.state,
            self.console,
            dry_run=dry_run,
        )

    def deployed(self, relative):
        return (self.destination / relative).read_text(encoding="utf-8")

    def record(self):
        return json.loads(
            (self.state / "ui" / "herdr-ui.json").read_text(encoding="utf-8")
        )


class DeployTest(Fixture):
    def test_first_deploy_writes_every_file_as_a_real_file(self):
        result = self.deploy()
        self.assertEqual(result.unchanged, 0)
        self.assertEqual(len(result.written), 7)
        self.assertEqual(result.pruned, [])
        self.assertEqual(
            self.deployed("mods/demo/helper.js"), "export const helper = 1;\n"
        )
        self.assertFalse((self.destination / "mods" / "demo" / "main.js").is_symlink())
        self.assertTrue((self.destination / "layouts" / "nested.json").is_file())

    def test_the_record_names_the_source_the_destination_and_every_file(self):
        self.deploy()
        record = self.record()
        self.assertEqual(record["name"], "herdr-ui")
        self.assertEqual(record["source"], str(Path(os.path.realpath(self.source))))
        self.assertEqual(
            record["destination"], str(Path(os.path.realpath(self.destination)))
        )
        self.assertEqual(len(record["files"]), 7)
        self.assertIn("mods/demo/main.js", record["files"])

    def test_files_are_written_helpers_first_then_entries_then_layouts(self):
        result = self.deploy()
        self.assertEqual(
            result.written,
            [
                "mods/demo/helper.js",
                "mods/demo/mark.svg",
                "mods/demo/main.js",
                "mods/demo/mod.json",
                "mods/other/main.js",
                "mods/other/mod.json",
                "layouts/nested.json",
            ],
        )
        # A helper is never behind an entry point, and no mod is behind a layout.
        order = {relative: index for index, relative in enumerate(result.written)}
        self.assertLess(order["mods/demo/helper.js"], order["mods/demo/main.js"])
        self.assertLess(order["mods/demo/mark.svg"], order["mods/demo/mod.json"])
        self.assertLess(order["mods/other/mod.json"], order["layouts/nested.json"])
        self.assertEqual(result.written[-1], "layouts/nested.json")

    def test_an_unchanged_artifact_writes_nothing_at_all(self):
        self.deploy()
        before = {
            path: path.stat().st_mtime_ns
            for path in self.destination.rglob("*")
            if path.is_file()
        }
        result = self.deploy()
        self.assertEqual(result.written, [])
        self.assertEqual(result.pruned, [])
        self.assertEqual(result.unchanged, 7)
        after = {
            path: path.stat().st_mtime_ns
            for path in self.destination.rglob("*")
            if path.is_file()
        }
        self.assertEqual(before, after)

    def test_only_the_changed_file_is_written(self):
        self.deploy()
        write(self.source / "mods" / "demo" / "helper.js", "export const helper = 2;\n")
        result = self.deploy()
        self.assertEqual(result.written, ["mods/demo/helper.js"])
        self.assertEqual(result.unchanged, 6)
        self.assertEqual(
            self.deployed("mods/demo/helper.js"), "export const helper = 2;\n"
        )

    def test_files_the_artifact_dropped_are_pruned_and_nothing_else_is(self):
        self.deploy()
        write(self.destination / "mods" / "demo" / "notes.md", "mine\n")
        write(self.destination / "shared.json", '{"layout": "nested"}\n')
        write(self.destination / "mods" / "mine" / "main.js", "// mine\n")
        (self.source / "mods" / "other" / "main.js").unlink()
        (self.source / "mods" / "other" / "mod.json").unlink()
        result = self.deploy()
        self.assertEqual(
            sorted(result.pruned), ["mods/other/main.js", "mods/other/mod.json"]
        )
        self.assertFalse((self.destination / "mods" / "other").exists())
        self.assertTrue((self.destination / "mods" / "demo" / "notes.md").is_file())
        self.assertTrue((self.destination / "mods" / "mine" / "main.js").is_file())
        self.assertEqual(self.deployed("shared.json"), '{"layout": "nested"}\n')
        self.assertEqual(len(self.record()["files"]), 5)

    def test_a_file_the_record_never_claimed_is_never_pruned(self):
        self.deploy()
        # A path the artifact no longer has, that this tool never wrote.
        write(self.destination / "mods" / "gone" / "main.js", "// someone else's\n")
        (self.source / "mods" / "other" / "main.js").unlink()
        (self.source / "mods" / "other" / "mod.json").unlink()
        result = self.deploy()
        self.assertNotIn("mods/gone/main.js", result.pruned)
        self.assertTrue((self.destination / "mods" / "gone" / "main.js").is_file())

    def test_a_dry_run_writes_nothing_and_records_nothing(self):
        write(self.destination / "mods" / "demo" / "main.js", "old\n")
        result = self.deploy(dry_run=True)
        self.assertEqual(
            result.written,
            [
                "mods/demo/helper.js",
                "mods/demo/mark.svg",
                "mods/demo/main.js",
                "mods/demo/mod.json",
                "mods/other/main.js",
                "mods/other/mod.json",
                "layouts/nested.json",
            ],
        )
        self.assertEqual(self.deployed("mods/demo/main.js"), "old\n")
        self.assertFalse((self.destination / "mods" / "demo" / "helper.js").exists())
        self.assertFalse((self.state / "ui" / "herdr-ui.json").exists())

    def test_deployed_files_are_readable_and_writable_by_their_owner(self):
        self.deploy()
        mode = stat.S_IMODE(
            (self.destination / "mods" / "demo" / "main.js").stat().st_mode
        )
        self.assertEqual(mode, 0o644)

    def test_no_scratch_directory_is_left_behind(self):
        self.deploy()
        self.assertEqual(
            [
                path.name
                for path in self.destination.iterdir()
                if path.name.startswith(".")
            ],
            [],
        )

    def test_a_change_with_a_scratch_directory_still_cleans_up(self):
        self.deploy()
        write(self.source / "mods" / "demo" / "helper.js", "// changed\n")
        self.deploy()
        self.assertFalse((self.destination / agents_ui.SCRATCH).exists())


class DestinationOwnershipTest(Fixture):
    def test_an_unmanaged_symlink_at_a_deployed_path_is_left_alone(self):
        target = self.destination / "mods" / "demo" / "main.js"
        target.parent.mkdir(parents=True)
        elsewhere = self.temporary / "elsewhere.js"
        write(elsewhere, "// home-manager's\n")
        target.symlink_to(elsewhere)
        result = self.deploy()
        self.assertIn(("mods/demo/main.js", mock.ANY), result.skipped)
        self.assertEqual(target.read_text(encoding="utf-8"), "// home-manager's\n")
        self.assertTrue(target.is_symlink())
        self.assertNotIn("mods/demo/main.js", self.record()["files"])

    def test_a_recorded_path_taken_over_by_a_symlink_is_left_alone(self):
        # This tool writes real files, so a link at a path it once wrote was put there by
        # someone else. Replacing it would be a change no deploy can undo faithfully.
        self.deploy()
        elsewhere = self.temporary / "taken-over.js"
        write(elsewhere, "// someone else's\n")
        target = self.destination / "mods" / "demo" / "main.js"
        target.unlink()
        target.symlink_to(elsewhere)
        write(self.source / "mods" / "demo" / "main.js", "// new upstream\n")
        result = self.deploy()
        self.assertIn(("mods/demo/main.js", mock.ANY), result.skipped)
        self.assertTrue(target.is_symlink())
        self.assertEqual(target.read_text(encoding="utf-8"), "// someone else's\n")
        # It is no longer ours: a later prune must not remove another owner's link.
        self.assertNotIn("mods/demo/main.js", self.record()["files"])

    def test_a_failed_deploy_never_deletes_a_symlink_that_took_a_path_over(self):
        # The mislabel this guards: reading no bytes from a symlink used to record it as a file
        # this run created, so a rollback would unlink it.
        self.deploy()
        elsewhere = self.temporary / "taken-over.js"
        write(elsewhere, "// someone else's\n")
        target = self.destination / "mods" / "demo" / "main.js"
        target.unlink()
        target.symlink_to(elsewhere)
        write(self.source / "mods" / "demo" / "helper.js", "// changed\n")
        real = os.replace
        calls = {"n": 0}

        def explode(source_path, target_path):
            calls["n"] += 1
            if calls["n"] == 2:
                raise OSError("disk full")
            return real(source_path, target_path)

        with mock.patch.object(agents_ui.os, "replace", explode):
            with self.assertRaises(OSError):
                self.deploy()
        self.assertTrue(target.is_symlink())
        self.assertEqual(target.read_text(encoding="utf-8"), "// someone else's\n")

    def test_a_symlinked_mod_directory_inside_the_tree_is_left_alone(self):
        shared = self.destination / "mods" / "shared-demo"
        write(shared / "main.js", "// linked\n")
        (self.destination / "mods" / "demo").symlink_to("shared-demo")
        result = self.deploy()
        self.assertTrue(
            any(relative.startswith("mods/demo/") for relative, _ in result.skipped)
        )
        self.assertEqual(
            (shared / "main.js").read_text(encoding="utf-8"), "// linked\n"
        )
        # The mods this tree does not own are still deployed.
        self.assertTrue((self.destination / "mods" / "other" / "main.js").is_file())

    def test_a_symlinked_directory_that_escapes_the_tree_is_refused(self):
        outside = self.temporary / "outside"
        outside.mkdir()
        (self.destination / "mods").mkdir(parents=True)
        (self.destination / "mods" / "demo").symlink_to(outside)
        with self.assertRaises(agents_ui.DeployError):
            self.deploy()
        self.assertEqual(list(outside.iterdir()), [])

    def test_a_record_made_for_another_destination_prunes_nothing_there(self):
        self.deploy()
        other = self.temporary / "other-config"
        write(other / "mods" / "other" / "main.js", "// stale\n")
        write(other / "mods" / "other" / "mod.json", '{"place": "none"}\n')
        (self.source / "mods" / "other" / "main.js").unlink()
        (self.source / "mods" / "other" / "mod.json").unlink()
        result = self.deploy(destination=other)
        self.assertEqual(result.pruned, [])
        self.assertTrue((other / "mods" / "other" / "main.js").is_file())

    def test_an_unreadable_record_is_reported_and_claims_nothing(self):
        record = self.state / "ui" / "herdr-ui.json"
        record.parent.mkdir(parents=True)
        record.write_text("{not json", encoding="utf-8")
        result = self.deploy()
        self.assertEqual(len(result.written), 7)
        self.assertTrue(self.console.warnings)
        self.assertIn("no deployed file will be pruned", self.console.warnings[0])
        self.assertEqual(len(self.record()["files"]), 7)

    def test_a_record_naming_an_escape_is_never_acted_on(self):
        self.deploy()
        outside = self.temporary / "outside.js"
        write(outside, "// keep me\n")
        record = self.record()
        record["files"].append("../outside.js")
        record["files"].append("shared.json")
        (self.state / "ui" / "herdr-ui.json").write_text(
            json.dumps(record), encoding="utf-8"
        )
        write(self.destination / "shared.json", "{}\n")
        (self.source / "mods" / "other" / "main.js").unlink()
        (self.source / "mods" / "other" / "mod.json").unlink()
        result = self.deploy()
        self.assertEqual(
            sorted(result.pruned), ["mods/other/main.js", "mods/other/mod.json"]
        )
        self.assertTrue(outside.is_file())
        self.assertTrue((self.destination / "shared.json").is_file())


class SourceTest(Fixture):
    def test_a_symlink_inside_the_artifact_is_deployed_as_the_file_it_names(self):
        write(self.source / "mods" / "demo" / "real.js", "// real\n")
        (self.source / "mods" / "demo" / "linked.js").symlink_to("real.js")
        result = self.deploy()
        self.assertIn("mods/demo/linked.js", result.written)
        deployed = self.destination / "mods" / "demo" / "linked.js"
        self.assertFalse(deployed.is_symlink())
        self.assertEqual(deployed.read_text(encoding="utf-8"), "// real\n")

    def test_a_symlink_that_resolves_outside_the_artifact_is_refused(self):
        outside = self.temporary / "outside.js"
        write(outside, "// elsewhere\n")
        (self.source / "mods" / "demo" / "linked.js").symlink_to(outside)
        with self.assertRaises(agents_ui.DeployError):
            self.deploy()
        self.assertFalse(self.destination.exists())

    def test_an_artifact_without_a_managed_folder_is_refused(self):
        plain = self.temporary / "plain"
        write(plain / "main.js", "// not a UI artifact\n")
        with self.assertRaises(agents_ui.DeployError):
            self.deploy(source=plain)

    def test_a_file_outside_the_managed_folders_is_refused(self):
        write(self.source / "shared.json", "{}\n")
        with self.assertRaises(agents_ui.DeployError):
            self.deploy()
        self.assertFalse((self.destination / "shared.json").exists())

    def test_a_missing_artifact_is_refused(self):
        with self.assertRaises(agents_ui.DeployError):
            self.deploy(source=self.temporary / "no-such-artifact")


class RollbackTest(Fixture):
    def test_a_failed_write_leaves_the_tree_it_found(self):
        self.deploy()
        write(self.destination / "mods" / "demo" / "helper.js", "// mine\n")
        before = self.record()
        write(self.source / "mods" / "demo" / "helper.js", "// new helper\n")
        write(self.source / "mods" / "demo" / "main.js", "// new main\n")
        real = os.replace
        calls = {"n": 0}

        def explode(source_path, target_path):
            calls["n"] += 1
            if calls["n"] == 2:
                raise OSError("disk full")
            return real(source_path, target_path)

        with mock.patch.object(agents_ui.os, "replace", explode):
            with self.assertRaises(OSError):
                self.deploy()
        # The first replacement is undone, and the record is the one the last good deploy wrote.
        self.assertEqual(self.deployed("mods/demo/helper.js"), "// mine\n")
        self.assertEqual(self.record(), before)

    def test_a_failed_first_write_leaves_no_file_behind(self):
        def explode(*_args, **_kwargs):
            raise OSError("disk full")

        with mock.patch.object(agents_ui.os, "replace", explode):
            with self.assertRaises(OSError):
                self.deploy()
        self.assertFalse((self.destination / "mods" / "demo" / "helper.js").exists())
        self.assertFalse((self.state / "ui" / "herdr-ui.json").exists())

    def test_a_record_that_cannot_be_written_rolls_the_files_back(self):
        # The record is the ledger a later prune trusts, so it is part of the transaction: a
        # deploy that cannot record itself leaves neither the files nor a record that differs
        # from them.
        self.deploy()
        before = self.record()
        write(self.source / "mods" / "demo" / "helper.js", "// new helper\n")
        write(self.source / "mods" / "demo" / "main.js", "// new main\n")
        with mock.patch.object(
            agents_ui, "save_record", side_effect=OSError("disk full")
        ):
            with self.assertRaises(OSError):
                self.deploy()
        self.assertEqual(
            self.deployed("mods/demo/helper.js"), "export const helper = 1;\n"
        )
        self.assertEqual(self.deployed("mods/demo/main.js"), "// main\n")
        self.assertEqual(self.record(), before)

    def test_a_rollback_restores_by_rename_and_never_truncates_a_file(self):
        # The deployed tree is watched, so a restore that truncated a mod would expose a
        # half-written file to the app for as long as the write took. This fails the third
        # rename - the ownership record's - so two files have been replaced and both must come
        # back through a rename of their own.
        self.deploy()
        write(self.source / "mods" / "demo" / "helper.js", "// new helper\n")
        write(self.source / "mods" / "demo" / "main.js", "// new main\n")
        real = os.replace
        calls = {"n": 0}

        def explode(source_path, target_path):
            calls["n"] += 1
            if calls["n"] == 3:
                raise OSError("disk full")
            return real(source_path, target_path)

        truncating = AssertionError(
            "a rollback truncated a file instead of renaming over it"
        )
        with (
            mock.patch.object(agents_ui.os, "replace", explode),
            mock.patch.object(Path, "write_bytes", side_effect=truncating),
            self.assertRaises(OSError),
        ):
            self.deploy()
        self.assertEqual(
            self.deployed("mods/demo/helper.js"), "export const helper = 1;\n"
        )
        self.assertEqual(self.deployed("mods/demo/main.js"), "// main\n")
        self.assertEqual(
            [
                path.name
                for path in self.destination.iterdir()
                if path.name.startswith(".")
            ],
            [],
        )

    def test_a_failed_prune_restores_what_it_removed(self):
        self.deploy()
        (self.source / "mods" / "other" / "main.js").unlink()
        (self.source / "mods" / "other" / "mod.json").unlink()
        original = agents_ui._remove_empty
        calls = {"n": 0}

        def explode(root, directory):
            calls["n"] += 1
            if calls["n"] == 1:
                raise OSError("busy")
            return original(root, directory)

        with mock.patch.object(agents_ui, "_remove_empty", explode):
            with self.assertRaises(OSError):
                self.deploy()
        self.assertTrue((self.destination / "mods" / "other" / "main.js").is_file())
        self.assertEqual(len(self.record()["files"]), 7)


if __name__ == "__main__":
    unittest.main()
