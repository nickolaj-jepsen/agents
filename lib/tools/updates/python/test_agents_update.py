#!/usr/bin/env python3
"""Tests for agents-update.py, the explicit agents publication CLI.

    python3 lib/tools/updates/python/test_agents_update.py

No Nix build and no network: a fake `nix` on PATH turns the expression it receives into a
fake store with the linkFarm shape the CLI reads back, and the checkout is a real (small)
git repository. The Nix expression itself is checked by its text here and, for the Claude
half, by `nix eval` (see the module's --expr-ready builder in README terms): the tests only
assert the wiring mkClaudePlugin needs.
"""

from __future__ import annotations

import importlib.machinery
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
CLI_PATH = HERE / "agents-update.py"


def load_cli():
    loader = importlib.machinery.SourceFileLoader("agents_update", str(CLI_PATH))
    spec = importlib.util.spec_from_loader("agents_update", loader)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    # dataclasses resolves annotations through sys.modules, so register before executing.
    sys.modules["agents_update"] = module
    loader.exec_module(module)
    return module


cli = load_cli()

REVISION = "1111111111111111111111111111111111111111"

FAKE_NIX = textwrap.dedent(
    """\
    #!/usr/bin/env bash
    # Stands in for `nix build`: reads the linkFarm entries out of --expr, builds a fake
    # store tree with the same shape and links --out-link at it.
    set -eu
    out=""
    expr=""
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --out-link) out="$2"; shift 2 ;;
        --expr) expr="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    if [ -n "${FAKE_NIX_LOG:-}" ]; then printf '%s\\n' "$expr" >"$FAKE_NIX_LOG"; fi
    if [ -n "${FAKE_NIX_FAIL:-}" ]; then
      echo "fake nix: the build failed" >&2
      exit 1
    fi
    store=${FAKE_NIX_STORE:?}
    # A fresh directory per invocation, the way a real linkFarm build gets a new store path:
    # the GC root of an older generation must not see this build's outputs.
    farm=$(mktemp -d "$store/farm.XXXXXX")
    for entry in $(printf '%s\\n' "$expr" | sed -n 's/.*name = "\\(plugins\\/[^"]*\\)".*/\\1/p'); do
      name=$(printf '%s' "${entry#plugins/}" | tr '/' '-')
      mkdir -p "$store/out-$name" "$(dirname "$farm/$entry")"
      ln -sfn "$store/out-$name" "$farm/$entry"
    done
    if printf '%s\\n' "$expr" | grep -q 'name = "skills"'; then
      snap=$(printf '%s\\n' "$expr" | sed -n 's/.*builtins.path { path = \\([^;]*\\);.*/\\1/p' | head -n1)
      rm -rf "$store/snapshot"
      mkdir -p "$store/snapshot"
      if [ -n "$snap" ] && [ -d "$snap/skills" ]; then cp -r "$snap/skills" "$store/snapshot/skills"; fi
      ln -sfn "$store/snapshot" "$farm/skills"
    fi
    # UI artifacts: a folder of the runtime UI (`mods/`, `layouts/`). From FAKE_NIX_UI_SRC when
    # the test names one, else a minimal tree, so a deploy has real files to write.
    for entry in $(printf '%s\\n' "$expr" | sed -n 's/.*name = "ui\\/\\([^"]*\\)".*/\\1/p'); do
      dir="$store/out-ui-$entry"
      rm -rf "$dir"
      mkdir -p "$dir"
      if [ -n "${FAKE_NIX_UI_SRC:-}" ]; then
        cp -r "$FAKE_NIX_UI_SRC"/. "$dir"/
      else
        mkdir -p "$dir/mods/$entry" "$dir/layouts"
        printf '// main\\n' >"$dir/mods/$entry/main.js"
        printf '{"place":"none"}\\n' >"$dir/mods/$entry/mod.json"
        printf '{"id":"root"}\\n' >"$dir/layouts/nested.json"
      fi
      mkdir -p "$(dirname "$farm/ui/$entry")"
      ln -sfn "$dir" "$farm/ui/$entry"
    done
    ln -sfn "$farm" "$out"
    """
)


def run_git(checkout, *args):
    subprocess.run(["git", "-C", str(checkout), *args], check=True, capture_output=True)


def make_checkout(root, plugins=None, skills=None, ui=("herdr-ui",)):
    """A small agents-like git checkout; `apps/<name>/package.json` decides what an app is.

    A `claude` or `pi` field makes it a plugin; `herdr: {ui: true}` makes it Herdr's UI
    artifact. The default checkout holds one of each, like the real one.
    """
    checkout = Path(root) / "checkout"
    checkout.mkdir(parents=True)
    plugins = (
        plugins
        if plugins is not None
        else {"answer": ("pi", "claude"), "docfix": ("pi",)}
    )
    for name, halves in plugins.items():
        directory = checkout / "apps" / name
        (directory / "src").mkdir(parents=True)
        package = {"name": f"@nickolaj-jepsen/{name}", "version": "0.1.0"}
        for half in halves:
            package[half] = {}
        (directory / "package.json").write_text(json.dumps(package), encoding="utf-8")
        (directory / "src" / "index.ts").write_text("export {};\n", encoding="utf-8")
    for name in ui or ():
        directory = checkout / "apps" / name
        (directory / "src" / "mods" / "demo").mkdir(parents=True)
        (directory / "src" / "mods" / "demo" / "queue.js").write_text(
            "// helper\n", encoding="utf-8"
        )
        (directory / "src" / "mods" / "demo" / "main.js").write_text(
            "// main\n", encoding="utf-8"
        )
        (directory / "src" / "mods" / "demo" / "mod.json").write_text(
            '{"place": "none"}\n', encoding="utf-8"
        )
        (directory / "src" / "layouts").mkdir(parents=True)
        (directory / "src" / "layouts" / "nested.json").write_text(
            '{"id": "root"}\n', encoding="utf-8"
        )
        (directory / "package.json").write_text(
            json.dumps(
                {
                    "name": f"@nickolaj-jepsen/{name}",
                    "version": "0.1.0",
                    "herdr": {"ui": True},
                }
            ),
            encoding="utf-8",
        )
    for name in skills if skills is not None else ["demo"]:
        directory = checkout / "skills" / name
        directory.mkdir(parents=True)
        (directory / "SKILL.md").write_text(f"# {name}\n", encoding="utf-8")
    (checkout / ".gitignore").write_text("node_modules/\n", encoding="utf-8")
    run_git(checkout, "init", "-q", "-b", "main")
    run_git(checkout, "add", "-A")
    run_git(
        checkout,
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.com",
        "commit",
        "-qm",
        "init",
    )
    return checkout


class NameSafetyTest(unittest.TestCase):
    def test_accepts_plugin_and_skill_names(self):
        for name in ("answer", "gh-stack", "a.b_c", "A1", "x" * 128):
            cli.validate_names([name])

    def test_rejects_names_that_could_escape(self):
        for name in ("", "../x", "a/b", ".hidden", "-x", "x y", "a" * 129, "a..b", "."):
            with self.subTest(name=name):
                with self.assertRaises(cli.UpdateError):
                    cli.validate_names([name])

    def test_repository_path_refuses_a_symlink_out_of_the_tree(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "checkout"
            (root / "apps").mkdir(parents=True)
            outside = Path(temporary) / "outside"
            outside.mkdir()
            (root / "apps" / "evil").symlink_to(outside)
            with self.assertRaises(cli.UpdateError):
                cli.repository_path(root, "apps", "evil", "package.json")

    def test_repository_path_accepts_a_path_inside(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "checkout"
            (root / "apps" / "good").mkdir(parents=True)
            (root / "apps" / "good" / "package.json").write_text("{}", encoding="utf-8")
            self.assertTrue(
                cli.repository_path(root, "apps", "good", "package.json").is_file()
            )


class BaselineStateTest(unittest.TestCase):
    def setUp(self):
        self.temporary = Path(tempfile.mkdtemp(prefix="agents-test-"))
        self.addCleanup(shutil.rmtree, self.temporary, ignore_errors=True)

    def write_baseline(self, payload):
        path = self.temporary / "baseline.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def test_baseline_keeps_nulls_and_missing_variants(self):
        path = self.write_baseline(
            {
                "revision": REVISION,
                "plugins": {
                    "answer": {"pi": "/nix/store/a", "claude": None},
                    "docfix": {"pi": "/nix/store/d"},
                },
                "skills": {"demo": "/nix/store/skills/demo"},
            }
        )
        baseline = cli.load_baseline(path)
        self.assertEqual(baseline.revision, REVISION)
        self.assertEqual(
            baseline.plugins["answer"], {"pi": "/nix/store/a", "claude": None}
        )
        self.assertEqual(
            baseline.plugins["docfix"], {"pi": "/nix/store/d", "claude": None}
        )
        self.assertEqual(baseline.skills, {"demo": "/nix/store/skills/demo"})

    def test_baseline_rejects_bad_shapes(self):
        for payload in (
            [],
            {"revision": 1},
            {"revision": REVISION, "plugins": []},
            {"revision": REVISION, "plugins": {"answer": []}},
            {"revision": REVISION, "plugins": {"answer": {"pi": 3}}},
            {"revision": REVISION, "skills": {"demo": 3}},
        ):
            with self.subTest(payload=payload):
                with self.assertRaises(cli.UpdateError):
                    cli.load_baseline(self.write_baseline(payload))

    def test_a_baseline_without_ui_reads_as_nothing_to_deploy(self):
        path = self.write_baseline({"revision": REVISION, "plugins": {}, "skills": {}})
        self.assertEqual(cli.load_baseline(path).ui, {})

    def test_a_baseline_reads_ui_paths_like_skills(self):
        path = self.write_baseline(
            {
                "revision": REVISION,
                "ui": {"herdr-ui": "/nix/store/herdr-ui", "other-ui": "/nix/store/o"},
            }
        )
        self.assertEqual(
            cli.load_baseline(path).ui,
            {"herdr-ui": "/nix/store/herdr-ui", "other-ui": "/nix/store/o"},
        )

    def test_a_baseline_rejects_a_ui_that_is_not_paths(self):
        for payload in (
            {"ui": []},
            {"ui": {"herdr-ui": 3}},
            {"ui": {"herdr-ui": None}},
        ):
            with self.subTest(payload=payload):
                path = self.write_baseline({"revision": REVISION, **payload})
                with self.assertRaises(cli.UpdateError):
                    cli.load_baseline(path)

    def test_an_old_state_file_without_ui_still_loads(self):
        state = self.temporary / "state"
        state.mkdir()
        (state / "current.json").write_text(
            json.dumps(
                {
                    "plugins": {
                        "answer": {
                            "pi": "/nix/store/a",
                            "claude": None,
                            "baseline": REVISION,
                        }
                    },
                    "skills": {"demo": {"path": "/nix/store/s", "baseline": REVISION}},
                }
            ),
            encoding="utf-8",
        )
        plugins, skills, ui = cli.load_state(state)
        self.assertIn("answer", plugins)
        self.assertIn("demo", skills)
        self.assertEqual(ui, {})

    def test_state_roundtrips_a_ui_entry(self):
        state = self.temporary / "state"
        cli.save_state(
            state,
            {},
            {},
            {"herdr-ui": {"path": "/nix/store/out-ui-herdr-ui", "baseline": REVISION}},
        )
        raw = json.loads((state / "current.json").read_text(encoding="utf-8"))
        self.assertEqual(list(raw), ["plugins", "skills", "ui"])
        self.assertEqual(
            raw["ui"],
            {"herdr-ui": {"path": "/nix/store/out-ui-herdr-ui", "baseline": REVISION}},
        )
        self.assertEqual(cli.load_state(state)[2], raw["ui"])

    def test_a_state_rejects_a_ui_entry_without_a_path(self):
        state = self.temporary / "state"
        state.mkdir()
        for entry in ({}, {"path": 3}, "nope"):
            with self.subTest(entry=entry):
                (state / "current.json").write_text(
                    json.dumps({"ui": {"herdr-ui": entry}}), encoding="utf-8"
                )
                with self.assertRaises(cli.UpdateError):
                    cli.load_state(state)

    def test_absent_state_is_empty(self):
        self.assertEqual(cli.load_state(self.temporary / "state"), ({}, {}, {}))

    def test_state_roundtrip_sorts_and_keeps_the_schema(self):
        state = self.temporary / "state"
        cli.save_state(
            state,
            {
                "zulu": {"pi": "/nix/store/z", "claude": None, "baseline": REVISION},
                "answer": {
                    "pi": "/nix/store/a",
                    "claude": "/nix/store/c",
                    "baseline": REVISION,
                },
            },
            {"demo": {"path": "/nix/store/skills/demo", "baseline": REVISION}},
        )
        raw = json.loads((state / "current.json").read_text(encoding="utf-8"))
        self.assertEqual(list(raw), ["plugins", "skills", "ui"])
        self.assertEqual(list(raw["plugins"]), ["answer", "zulu"])
        self.assertEqual(
            raw["plugins"]["answer"],
            {"pi": "/nix/store/a", "claude": "/nix/store/c", "baseline": REVISION},
        )
        plugins, skills, ui = cli.load_state(state)
        self.assertEqual(ui, {})
        self.assertEqual(plugins["zulu"]["claude"], None)
        self.assertEqual(skills["demo"]["path"], "/nix/store/skills/demo")
        self.assertEqual(
            sorted(path.name for path in state.iterdir() if path.name.startswith(".")),
            [],
        )

    def test_save_state_leaves_the_old_file_on_a_failed_rename(self):
        state = self.temporary / "state"
        cli.save_state(
            state, {"answer": {"pi": "old", "claude": None, "baseline": REVISION}}, {}
        )
        before = (state / "current.json").read_text(encoding="utf-8")
        original = cli.os.replace

        def explode(*_args, **_kwargs):
            raise OSError("disk full")

        cli.os.replace = explode
        try:
            with self.assertRaises(OSError):
                cli.save_state(
                    state,
                    {"answer": {"pi": "new", "claude": None, "baseline": REVISION}},
                    {},
                )
        finally:
            cli.os.replace = original
        self.assertEqual((state / "current.json").read_text(encoding="utf-8"), before)
        self.assertEqual(
            [path.name for path in state.iterdir() if path.name.startswith(".")], []
        )


class EffectiveTest(unittest.TestCase):
    def baseline(self, plugins=None, skills=None):
        return cli.Baseline(
            revision=REVISION, plugins=plugins or {}, skills=skills or {}
        )

    def test_baseline_only(self):
        baseline = self.baseline(
            {
                "answer": {"pi": "/b/pi", "claude": "/b/claude"},
                "docfix": {"pi": "/b/docfix", "claude": None},
            },
            {"demo": "/b/skills/demo"},
        )
        self.assertEqual(
            cli.effective(baseline, {}, {}),
            {
                "plugins": {
                    "answer": {"pi": "/b/pi", "claude": "/b/claude"},
                    "docfix": {"pi": "/b/docfix", "claude": None},
                },
                "skills": {"demo": "/b/skills/demo"},
                "ui": {},
            },
        )

    def test_ui_resolves_from_the_baseline_and_the_override(self):
        baseline = cli.Baseline(
            revision=REVISION,
            plugins={},
            skills={},
            ui={"herdr-ui": "/b/herdr-ui", "other-ui": "/b/other-ui"},
        )
        resolved = cli.effective(
            baseline,
            {},
            {},
            {"herdr-ui": {"path": "/s/herdr-ui", "baseline": REVISION}},
        )
        self.assertEqual(
            resolved["ui"], {"herdr-ui": "/s/herdr-ui", "other-ui": "/b/other-ui"}
        )
        # The keys a consumer already reads keep their shape and their order.
        self.assertEqual(list(resolved), ["plugins", "skills", "ui"])

    def test_override_wins_and_missing_variant_inherits(self):
        baseline = self.baseline({"answer": {"pi": "/b/pi", "claude": "/b/claude"}})
        state = {"answer": {"pi": "/s/pi", "claude": None, "baseline": REVISION}}
        resolved = cli.effective(baseline, state, {})
        self.assertEqual(
            resolved["plugins"]["answer"], {"pi": "/s/pi", "claude": "/b/claude"}
        )

    def test_state_only_name_appears_with_missing_halves_null(self):
        resolved = cli.effective(
            self.baseline(), {"brand-new": {"pi": "/s/pi", "claude": None}}, {}
        )
        self.assertEqual(
            resolved["plugins"], {"brand-new": {"pi": "/s/pi", "claude": None}}
        )
        self.assertEqual(resolved["skills"], {})
        self.assertEqual(resolved["ui"], {})

    def test_skills_override_and_union(self):
        baseline = self.baseline(
            skills={"demo": "/b/skills/demo", "grilling": "/b/skills/grilling"}
        )
        state = {
            "new": {"path": "/s/skills/new", "baseline": REVISION},
            "demo": {"path": "/s/skills/demo", "baseline": REVISION},
        }
        resolved = cli.effective(baseline, {}, state)
        self.assertEqual(
            resolved["skills"],
            {
                "demo": "/s/skills/demo",
                "grilling": "/b/skills/grilling",
                "new": "/s/skills/new",
            },
        )

    def test_resolve_is_sorted_and_has_no_extra_keys(self):
        resolved = cli.effective(
            self.baseline(
                {
                    "zulu": {"pi": "/b/z", "claude": None},
                    "answer": {"pi": "/b/a", "claude": None},
                }
            ),
            {},
            {},
        )
        self.assertEqual(list(resolved), ["plugins", "skills", "ui"])
        self.assertEqual(list(resolved["plugins"]), ["answer", "zulu"])
        self.assertEqual(list(resolved["plugins"]["answer"]), ["pi", "claude"])


@unittest.skipUnless(shutil.which("git"), "git is required")
class Fixture(unittest.TestCase):
    """A checkout, a baseline, a fake store and a fake nix on PATH."""

    def setUp(self):
        self.temporary = Path(tempfile.mkdtemp(prefix="agents-test-"))
        self.addCleanup(shutil.rmtree, self.temporary, ignore_errors=True)
        # The CLI publishes into TMPDIR. Point it inside this test's directory, so snapshots
        # cannot outlive the test and no other test process can see (or clean up) them.
        self.snapshots = self.temporary / "tmp"
        self.snapshots.mkdir()
        previous_tempdir = tempfile.tempdir
        tempfile.tempdir = str(self.snapshots)
        self.addCleanup(setattr, tempfile, "tempdir", previous_tempdir)
        self.store = self.temporary / "store"
        (self.store / "nixpkgs-source").mkdir(parents=True)
        (self.store / "claude-code-2.0").mkdir()
        # A pinned UI artifact with content a test can tell apart from a published one.
        (self.store / "baseline-herdr-ui" / "mods" / "demo").mkdir(parents=True)
        (self.store / "baseline-herdr-ui" / "mods" / "demo" / "main.js").write_text(
            "// pinned\n", encoding="utf-8"
        )
        (self.store / "baseline-herdr-ui" / "layouts").mkdir()
        (self.store / "baseline-herdr-ui" / "layouts" / "nested.json").write_text(
            '{"id": "pinned"}\n', encoding="utf-8"
        )
        self.bin = self.temporary / "bin"
        self.bin.mkdir()
        fake = self.bin / "nix"
        # Nix sandboxes need an explicit interpreter, not /usr/bin/env.
        fake.write_text(
            FAKE_NIX.replace("#!/usr/bin/env bash", f"#!{shutil.which('bash')}"),
            encoding="utf-8",
        )
        fake.chmod(0o755)
        self.checkout = make_checkout(self.temporary)
        self.baseline_path = self.temporary / "baseline.json"
        self.write_baseline()
        self.state_home = self.temporary / "state"
        self.expr_log = self.temporary / "expr.log"
        self.config_home = self.temporary / "config"
        self.env = {
            "PATH": f"{self.bin}{os.pathsep}{os.environ.get('PATH', '')}",
            "HOME": str(self.temporary / "home"),
            "TMPDIR": str(self.snapshots),
            "XDG_STATE_HOME": str(self.state_home),
            "XDG_CONFIG_HOME": str(self.config_home),
            "AGENTS_BASELINE": str(self.baseline_path),
            "AGENTS_CHECKOUT": str(self.checkout),
            "AGENTS_NIXPKGS": str(self.store / "nixpkgs-source"),
            "AGENTS_CLAUDE": str(self.store / "claude-code-2.0"),
            "AGENTS_SYSTEM": "x86_64-linux",
            "AGENTS_UPDATE_LOCK_TIMEOUT": "5",
            "FAKE_NIX_STORE": str(self.store),
            "FAKE_NIX_LOG": str(self.expr_log),
            # The artifact a publish builds is the checkout's own UI sources, so a deploy has
            # real files to put where Herdr reads them.
            "FAKE_NIX_UI_SRC": str(self.checkout / "apps" / "herdr-ui" / "src"),
        }

    # -- helpers ---------------------------------------------------------------------

    def assert_ok(self, result, message=""):
        code, out, err = result
        self.assertEqual(
            code, 0, f"{message}\nexpected exit 0\nstdout:\n{out}\nstderr:\n{err}"
        )
        return out, err

    @property
    def state(self):
        return self.state_home / "agents-updates"

    @property
    def current(self):
        return self.state / "current.json"

    def write_baseline(self, revision=REVISION, plugins=None, skills=None, ui=None):
        payload = {
            "revision": revision,
            "plugins": plugins
            if plugins is not None
            else {
                "answer": {
                    "pi": str(self.store / "baseline-answer-pi"),
                    "claude": str(self.store / "baseline-answer-claude"),
                },
                "docfix": {
                    "pi": str(self.store / "baseline-docfix-pi"),
                    "claude": None,
                },
            },
            "skills": skills
            if skills is not None
            else {"demo": str(self.store / "baseline-skills" / "demo")},
            "ui": ui if ui is not None else {"herdr-ui": str(self.baseline_ui)},
        }
        self.baseline_path.write_text(json.dumps(payload), encoding="utf-8")
        return payload

    @property
    def baseline_ui(self):
        """The pinned UI artifact: a store-shaped tree a deploy can read."""
        return self.store / "baseline-herdr-ui"

    def run_cli(self, *argv, env=None):
        out, err = io.StringIO(), io.StringIO()
        code = cli.main(list(argv), dict(self.env if env is None else env), out, err)
        return code, out.getvalue(), err.getvalue()

    def read_state(self):
        return json.loads(self.current.read_text(encoding="utf-8"))

    def expr(self):
        return (
            self.expr_log.read_text(encoding="utf-8") if self.expr_log.exists() else ""
        )

    def update(self, *argv, env=None):
        return self.run_cli("update", *argv, env=env)


class SnapshotTest(Fixture):
    def test_snapshot_publishes_tracked_untracked_and_skips_ignored(self):
        (self.checkout / "stray.txt").write_text("untracked\n", encoding="utf-8")
        (self.checkout / "node_modules").mkdir()
        (self.checkout / "node_modules" / "junk.js").write_text(
            "ignored\n", encoding="utf-8"
        )
        (self.checkout / "apps" / "answer" / "src" / "index.ts").write_text(
            "// edited\n", encoding="utf-8"
        )
        destination = self.temporary / "snapshot"
        snapshot = cli.publish_snapshot(self.checkout, destination)
        self.assertTrue((destination / "stray.txt").is_file())
        self.assertTrue(
            (destination / "apps" / "answer" / "src" / "index.ts").is_file()
        )
        self.assertFalse((destination / "node_modules").exists())
        self.assertFalse((destination / ".git").exists())
        self.assertEqual(snapshot.revision, self.head())
        self.assertGreaterEqual(snapshot.dirty, 2)
        self.assertGreater(snapshot.files, 5)

    def test_snapshot_keeps_relative_symlinks_and_rewrites_absolute_ones(self):
        (self.checkout / "relative-link").symlink_to("skills/demo")
        (self.checkout / "absolute-link").symlink_to(
            (self.checkout / "skills" / "demo").resolve()
        )
        run_git(self.checkout, "add", "-A")
        run_git(
            self.checkout,
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.com",
            "commit",
            "-qm",
            "links",
        )
        destination = self.temporary / "snapshot"
        cli.publish_snapshot(self.checkout, destination)
        self.assertEqual(os.readlink(destination / "relative-link"), "skills/demo")
        # The rewritten link must resolve inside the snapshot, not back to the checkout.
        link = destination / "absolute-link"
        self.assertFalse(os.path.isabs(os.readlink(link)))
        self.assertEqual(
            Path(os.path.realpath(link)),
            Path(os.path.realpath(destination / "skills" / "demo")),
        )
        self.assertEqual(link.resolve(), destination.resolve() / "skills" / "demo")
        self.assertTrue((link / "SKILL.md").is_file())

    def test_an_absolute_link_outside_the_checkout_is_refused(self):
        outside = self.temporary / "outside"
        outside.mkdir()
        (self.checkout / "outside-link").symlink_to(outside)
        run_git(self.checkout, "add", "-A")
        run_git(
            self.checkout,
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.com",
            "commit",
            "-qm",
            "outside",
        )
        with self.assertRaises(cli.UpdateError) as caught:
            cli.publish_snapshot(self.checkout, self.temporary / "snapshot")
        self.assertIn("outside the checkout", str(caught.exception))
        self.assertIn(
            "point it at a tracked path inside the checkout", str(caught.exception)
        )

    def test_a_tracked_link_chain_is_flattened_to_its_final_target(self):
        # git lists a-link before b-link, so validating links in place would find b-link's
        # snapshot copy missing. Both links must resolve to the published skills/demo.
        (self.checkout / "a-link").symlink_to("b-link")
        (self.checkout / "b-link").symlink_to("skills/demo")
        (self.checkout / "z-link").symlink_to("y-link")
        (self.checkout / "y-link").symlink_to("skills/demo")
        run_git(self.checkout, "add", "-A")
        run_git(
            self.checkout,
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.com",
            "commit",
            "-qm",
            "chain",
        )
        destination = self.temporary / "snapshot"
        cli.publish_snapshot(self.checkout, destination)
        for name in ("a-link", "b-link", "y-link", "z-link"):
            with self.subTest(link=name):
                self.assertEqual(os.readlink(destination / name), "skills/demo")
                self.assertEqual(
                    Path(os.path.realpath(destination / name)),
                    Path(os.path.realpath(destination / "skills" / "demo")),
                )

    def test_a_chain_that_leaves_the_checkout_is_refused(self):
        (self.checkout / "chain-link").symlink_to("escape-link")
        (self.checkout / "escape-link").symlink_to("../../etc/passwd")
        run_git(self.checkout, "add", "-A")
        run_git(
            self.checkout,
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.com",
            "commit",
            "-qm",
            "chain",
        )
        with self.assertRaises(cli.UpdateError) as caught:
            cli.publish_snapshot(self.checkout, self.temporary / "snapshot")
        self.assertIn("outside the checkout", str(caught.exception))

    def test_a_link_to_an_unpublished_file_is_refused(self):
        # The snapshot carries only tracked + untracked-not-ignored files, so a link into an
        # ignored directory has no copy to point at, and keeping the live path would make the
        # store snapshot mutable.
        (self.checkout / "node_modules").mkdir()
        (self.checkout / "node_modules" / "dep.js").write_text("x\n", encoding="utf-8")
        (self.checkout / "ignored-link").symlink_to(
            (self.checkout / "node_modules" / "dep.js").resolve()
        )
        run_git(self.checkout, "add", "-f", "ignored-link")
        run_git(
            self.checkout,
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.com",
            "commit",
            "-qm",
            "ignored",
        )
        with self.assertRaises(cli.UpdateError) as caught:
            cli.publish_snapshot(self.checkout, self.temporary / "snapshot")
        self.assertIn("the snapshot does not carry", str(caught.exception))
        self.assertIn("commit that target", str(caught.exception))

    def test_a_relative_link_that_escapes_the_snapshot_is_refused(self):
        (self.checkout / "escape-link").symlink_to("../../etc/passwd")
        (self.checkout / "dotdot-link").symlink_to("..")
        run_git(self.checkout, "add", "-A")
        run_git(
            self.checkout,
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.com",
            "commit",
            "-qm",
            "escape",
        )
        for name in ("escape-link", "dotdot-link"):
            with self.subTest(link=name):
                with self.assertRaises(cli.UpdateError) as caught:
                    cli.publish_snapshot(self.checkout, self.temporary / "snapshot")
                self.assertIn("outside the checkout", str(caught.exception))

    def test_a_relative_link_to_a_published_path_is_kept(self):
        (self.checkout / "nested").mkdir()
        (self.checkout / "nested" / "link").symlink_to("../skills/demo/SKILL.md")
        run_git(self.checkout, "add", "-A")
        run_git(
            self.checkout,
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.com",
            "commit",
            "-qm",
            "nested",
        )
        destination = self.temporary / "snapshot"
        cli.publish_snapshot(self.checkout, destination)
        self.assertEqual(
            os.readlink(destination / "nested" / "link"), "../skills/demo/SKILL.md"
        )
        self.assertTrue((destination / "nested" / "link").is_file())
        self.assertEqual(
            Path(os.path.realpath(destination / "nested" / "link")).parent,
            Path(os.path.realpath(destination / "skills" / "demo")),
        )

    def test_the_update_refuses_a_mutable_link_without_touching_state(self):
        (self.checkout / "escape-link").symlink_to("../../etc/passwd")
        run_git(self.checkout, "add", "-A")
        run_git(
            self.checkout,
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.com",
            "commit",
            "-qm",
            "escape",
        )
        code, out, err = self.update("answer")
        self.assertEqual(code, 1)
        self.assertIn("outside the checkout", err)
        self.assertFalse(self.current.exists())
        self.assertEqual(out, "")

    def head(self):
        return subprocess.run(
            ["git", "-C", str(self.checkout), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()


class UpdateTest(Fixture):
    def test_update_builds_both_halves_and_commits_state(self):
        code, out, err = self.update("answer")
        self.assertEqual(code, 0, err)
        raw = self.read_state()
        self.assertEqual(
            raw["plugins"]["answer"]["pi"], str(self.store / "out-answer-pi")
        )
        self.assertEqual(
            raw["plugins"]["answer"]["claude"], str(self.store / "out-answer-claude")
        )
        self.assertEqual(raw["plugins"]["answer"]["baseline"], REVISION)
        self.assertIn("published answer pi, answer claude", out)
        roots = list((self.state / "roots").iterdir())
        self.assertEqual(len(roots), 1)
        self.assertTrue((roots[0] / "build").is_symlink())
        self.assertTrue(
            os.readlink(roots[0] / "build").startswith(str(self.store / "farm"))
        )

    def test_expression_wires_mkclaudeplugin_to_the_supplied_claude_package(self):
        self.update("answer")
        expression = self.expr()
        self.assertIn(
            f"builtins.storePath {self.store / 'claude-code-2.0'}", expression
        )
        self.assertIn(
            "mkClaude = flake.lib.mkClaudePlugin { inherit pkgs claude-code; }",
            expression,
        )
        self.assertIn('mkClaude "answer"', expression)
        self.assertIn('plugins."answer".path', expression)
        self.assertIn('builtins.getFlake "path:', expression)
        self.assertIn(f"import {self.store / 'nixpkgs-source'}", expression)
        self.assertIn('name = "plugins/answer/pi"', expression)
        self.assertNotIn("builtins.path {", expression)

    def test_harness_filter_builds_only_that_half(self):
        code, _, err = self.update("answer", "--harness", "pi")
        self.assertEqual(code, 0, err)
        raw = self.read_state()
        self.assertEqual(
            raw["plugins"]["answer"]["pi"], str(self.store / "out-answer-pi")
        )
        self.assertIsNone(raw["plugins"]["answer"]["claude"])
        expression = self.expr()
        self.assertNotIn("mkClaude", expression)
        self.assertNotIn("claude-code", expression)

    def test_skill_update_snapshots_the_whole_tree(self):
        code, out, err = self.update("demo", "--skill")
        self.assertEqual(code, 0, err)
        raw = self.read_state()
        self.assertEqual(
            raw["skills"]["demo"]["path"],
            str(self.store / "snapshot" / "skills" / "demo"),
        )
        self.assertEqual(raw["skills"]["demo"]["baseline"], REVISION)
        self.assertIn('name = "skills"', self.expr())
        self.assertIn("builtins.path { path =", self.expr())
        self.assertIn(
            "demo skill: " + str(self.store / "snapshot" / "skills" / "demo"), out
        )

    def test_new_plugin_name_is_allowed_and_resolves(self):
        directory = self.checkout / "apps" / "brand-new"
        (directory / "src").mkdir(parents=True)
        (directory / "package.json").write_text(
            json.dumps(
                {"name": "@nickolaj-jepsen/brand-new", "version": "0.1.0", "pi": {}}
            ),
            encoding="utf-8",
        )
        run_git(self.checkout, "add", "-A")
        run_git(
            self.checkout,
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.com",
            "commit",
            "-qm",
            "new",
        )
        code, _, err = self.update("brand-new")
        self.assertEqual(code, 0, err)
        code, out, err = self.run_cli("resolve")
        self.assertEqual(code, 0, err)
        resolved = json.loads(out)
        self.assertEqual(
            resolved["plugins"]["brand-new"],
            {"pi": str(self.store / "out-brand-new-pi"), "claude": None},
        )

    def test_update_of_a_skipped_half_inherits_the_baseline(self):
        self.write_baseline(
            plugins={
                "docfix": {
                    "pi": str(self.store / "baseline-docfix-pi"),
                    "claude": str(self.store / "baseline-docfix-claude"),
                }
            }
        )
        code, _, err = self.update("docfix")
        self.assertEqual(code, 0, err)
        raw = self.read_state()
        self.assertIsNone(raw["plugins"]["docfix"]["claude"])
        code, out, err = self.run_cli("resolve")
        resolved = json.loads(out)
        self.assertEqual(
            resolved["plugins"]["docfix"]["claude"],
            str(self.store / "baseline-docfix-claude"),
        )

    def test_unknown_name_fails_without_writing_state(self):
        code, out, err = self.update("nope")
        self.assertEqual(code, 1)
        self.assertIn("not a plugin in the checkout", err)
        self.assertFalse(self.current.exists())
        self.assertEqual(out, "")

    def test_explicit_unsupported_harness_fails(self):
        code, _, err = self.update("docfix", "--harness", "claude")
        self.assertEqual(code, 1)
        self.assertIn("no claude half", err)
        self.assertFalse(self.current.exists())

    def test_bad_name_fails_before_touching_anything(self):
        code, _, err = self.update("../answer")
        self.assertEqual(code, 1)
        self.assertIn("bad name", err)
        self.assertFalse(self.state.exists())

    def test_failed_build_preserves_the_previous_state(self):
        self.assert_ok(self.update("answer"))
        before = self.current.read_text(encoding="utf-8")
        failing = dict(self.env, FAKE_NIX_FAIL="1")
        code, _, err = self.update("answer", env=failing)
        self.assertEqual(code, 1)
        self.assertIn(
            "the snapshot build failed; the state in current.json is unchanged", err
        )
        self.assertIn("fake nix: the build failed", err)
        self.assertEqual(self.current.read_text(encoding="utf-8"), before)
        # The published tree is kept for inspection, with its path reported.
        self.assertIn("kept the published snapshot in", err)

    def test_failed_build_writes_no_state_at_all(self):
        failing = dict(self.env, FAKE_NIX_FAIL="1")
        code, _, _ = self.update("answer", env=failing)
        self.assertEqual(code, 1)
        self.assertFalse(self.current.exists())

    def test_dry_run_builds_nothing_and_writes_nothing(self):
        code, out, err = self.update("answer", "--dry-run")
        self.assertEqual(code, 0, err)
        self.assertIn("dry run: answer pi, answer claude from", out)
        self.assertIn("(11 files, clean)", out)
        self.assertIn("dry run: nothing built, deployed or recorded", out)
        self.assertFalse(self.expr_log.exists())
        self.assertFalse(self.current.exists())

    def test_a_filtered_update_keeps_the_other_halves_drift_visible(self):
        self.assert_ok(self.update("answer"))
        self.write_baseline(revision="2222222222222222222222222222222222222222")
        self.assert_ok(self.update("answer", "--harness", "pi"))
        raw = self.read_state()
        # The claude half is still the old snapshot, so the entry must still say so.
        self.assertEqual(raw["plugins"]["answer"]["baseline"], REVISION)
        code, out, _ = self.run_cli("check")
        self.assertEqual(code, 0)
        self.assertIn("answer was published from 1111111", out)
        self.assertIn("the pinned baseline is 2222222", out)
        # A full update restamps the entry and the warning clears.
        self.assert_ok(self.update("answer"))
        self.assertEqual(self.read_state()["plugins"]["answer"]["baseline"], "2" * 40)
        self.assertEqual(self.run_cli("check")[1], "")

    def test_a_filtered_update_of_an_inheriting_entry_still_restamps(self):
        # The other half only inherits the baseline, so there is no stale override to hide.
        self.assert_ok(self.update("answer", "--harness", "pi"))
        self.write_baseline(revision="2222222222222222222222222222222222222222")
        self.assert_ok(self.update("answer", "--harness", "pi"))
        self.assertEqual(self.read_state()["plugins"]["answer"]["baseline"], "2" * 40)
        self.assertEqual(self.run_cli("check")[1], "")

    def test_a_filtered_update_never_drops_the_other_half(self):
        # An earlier publication recorded a claude half for docfix; the checkout no longer
        # offers one. Filtering to pi must leave that override in place, not null it out.
        self.state.mkdir(parents=True)
        self.current.write_text(
            json.dumps(
                {
                    "plugins": {
                        "docfix": {
                            "pi": None,
                            "claude": str(self.store / "old-docfix-claude"),
                            "baseline": REVISION,
                        }
                    },
                    "skills": {},
                }
            ),
            encoding="utf-8",
        )
        self.assert_ok(self.update("docfix", "--harness", "pi"))
        raw = self.read_state()
        self.assertEqual(
            raw["plugins"]["docfix"]["pi"], str(self.store / "out-docfix-pi")
        )
        self.assertEqual(
            raw["plugins"]["docfix"]["claude"], str(self.store / "old-docfix-claude")
        )
        # ... and the entry still records the baseline that claude half came from.
        self.assertEqual(raw["plugins"]["docfix"]["baseline"], REVISION)

    def test_an_unfiltered_update_drops_a_half_the_checkout_no_longer_offers(self):
        self.state.mkdir(parents=True)
        self.current.write_text(
            json.dumps(
                {
                    "plugins": {
                        "docfix": {
                            "pi": None,
                            "claude": str(self.store / "old-docfix-claude"),
                            "baseline": REVISION,
                        }
                    },
                    "skills": {},
                }
            ),
            encoding="utf-8",
        )
        self.assert_ok(self.update("docfix"))
        raw = self.read_state()
        self.assertEqual(
            raw["plugins"]["docfix"]["pi"], str(self.store / "out-docfix-pi")
        )
        self.assertIsNone(raw["plugins"]["docfix"]["claude"])

    def test_skill_update_keeps_plugin_snapshots(self):
        self.assert_ok(self.update("answer"))
        self.assert_ok(self.update("demo", "--skill"))
        raw = self.read_state()
        self.assertIn("answer", raw["plugins"])
        self.assertIn("demo", raw["skills"])

    def test_harness_with_skill_is_refused(self):
        code, _, err = self.update("demo", "--skill", "--harness", "pi")
        self.assertEqual(code, 1)
        self.assertIn("skills have none", err)

    def test_concurrent_updates_are_locked_out(self):
        self.state.mkdir(parents=True)
        descriptor = os.open(self.state / "lock", os.O_CREAT | os.O_RDWR, 0o644)
        try:
            cli.fcntl.flock(descriptor, cli.fcntl.LOCK_EX)
            env = dict(self.env, AGENTS_UPDATE_LOCK_TIMEOUT="0.2")
            code, _, err = self.update("answer", env=env)
        finally:
            os.close(descriptor)
        self.assertEqual(code, 1)
        self.assertIn("another agents update holds", err)
        self.assertFalse(self.current.exists())

    def test_update_is_idempotent_and_keeps_every_root(self):
        self.assert_ok(self.update("answer"))
        first = json.loads(self.current.read_text(encoding="utf-8"))
        out, _ = self.assert_ok(self.update("answer"))
        second = json.loads(self.current.read_text(encoding="utf-8"))
        self.assertEqual(first, second)
        # Roots are never pruned: a running session may still load an older snapshot, and
        # Claude Code resolves plugin paths at launch, so the CLI cannot know it is dead.
        roots = sorted((self.state / "roots").iterdir())
        self.assertEqual(len(roots), 2)
        for root in roots:
            self.assertTrue((root / "build").is_symlink())
        self.assertIn("older roots stay for running sessions", out)


class ResetTest(Fixture):
    def test_reset_one_harness_keeps_the_other(self):
        self.assert_ok(self.update("answer"))
        code, out, err = self.run_cli("reset", "answer", "--harness", "pi")
        self.assertEqual(code, 0, err)
        raw = self.read_state()
        self.assertIsNone(raw["plugins"]["answer"]["pi"])
        self.assertEqual(
            raw["plugins"]["answer"]["claude"], str(self.store / "out-answer-claude")
        )
        self.assertIn("answer (pi)", out)

    def test_reset_removes_the_whole_entry(self):
        self.assert_ok(self.update("answer"))
        self.assert_ok(self.run_cli("reset", "answer"))
        raw = self.read_state()
        self.assertNotIn("answer", raw["plugins"])

    def test_reset_skill(self):
        self.assert_ok(self.update("demo", "--skill"))
        self.assert_ok(self.run_cli("reset", "demo", "--skill"))
        raw = self.read_state()
        self.assertNotIn("demo", raw["skills"])

    def test_reset_unknown_name_is_a_no_op(self):
        self.assert_ok(self.update("answer"))
        before = self.current.read_text(encoding="utf-8")
        code, out, err = self.run_cli("reset", "nope")
        self.assertEqual(code, 0, err)
        self.assertIn("nothing to reset", out)
        self.assertEqual(self.current.read_text(encoding="utf-8"), before)

    def test_reset_restored_resolution_is_the_baseline(self):
        self.assert_ok(self.update("answer"))
        self.assert_ok(self.run_cli("reset", "answer"))
        code, out, _ = self.run_cli("resolve")
        self.assertEqual(code, 0)
        resolved = json.loads(out)
        self.assertEqual(
            resolved["plugins"]["answer"],
            {
                "pi": str(self.store / "baseline-answer-pi"),
                "claude": str(self.store / "baseline-answer-claude"),
            },
        )


class UiTest(Fixture):
    """The Herdr UI artifact: detected from its manifest, built as a package, deployed."""

    @property
    def deployed(self):
        return self.config_home / "herdr-app"

    def deployed_text(self, relative):
        return (self.deployed / relative).read_text(encoding="utf-8")

    def ui_state(self):
        return self.read_state().get("ui", {})

    def test_update_detects_the_ui_artifact_without_a_flag(self):
        out, err = self.assert_ok(self.update("herdr-ui"))
        self.assertIn("herdr-ui ui: ", out)
        self.assertIn("deployed", out)
        # The artifact is the flake's own package, not plugin packaging.
        expression = self.expr()
        self.assertIn("flake.packages.${system}", expression)
        self.assertIn('name = "ui/herdr-ui"', expression)
        self.assertNotIn("pluginsFor", expression.replace("pluginsFor pkgs", ""))
        self.assertEqual(
            self.ui_state()["herdr-ui"]["path"], str(self.store / "out-ui-herdr-ui")
        )
        self.assertEqual(self.ui_state()["herdr-ui"]["baseline"], REVISION)
        self.assertEqual(self.deployed_text("mods/demo/main.js"), "// main\n")
        self.assertEqual(self.deployed_text("layouts/nested.json"), '{"id": "root"}\n')
        self.assertFalse((self.deployed / "shared.json").exists())

    def test_update_says_it_did_not_restart_or_confirm_anything(self):
        out, _ = self.assert_ok(self.update("herdr-ui"))
        self.assertIn("no restart; Herdr watches these files", out)
        # The honest half: a write is not proof that a running app applied anything.
        self.assertIn("not that a running app applied it", out)

    def test_a_second_update_writes_nothing(self):
        self.assert_ok(self.update("herdr-ui"))
        out, _ = self.assert_ok(self.update("herdr-ui"))
        self.assertIn("deployed 0 written", out)
        self.assertNotIn("no restart", out)

    def test_update_dry_run_builds_and_deploys_nothing(self):
        out, err = self.assert_ok(self.update("herdr-ui", "--dry-run"))
        self.assertIn("herdr-ui ui", out)
        self.assertIn(f"would deploy into {self.deployed}", out)
        self.assertIn("nothing built, deployed or recorded", out)
        self.assertFalse(self.expr())
        self.assertFalse(self.current.exists())
        self.assertFalse(self.deployed.exists())

    def test_reset_drops_the_override_and_deploys_the_baseline(self):
        self.assert_ok(self.update("herdr-ui"))
        self.assertEqual(
            len([path for path in self.deployed.rglob("*") if path.is_file()]), 4
        )
        out, err = self.assert_ok(self.run_cli("reset", "herdr-ui"))
        self.assertIn("herdr-ui (ui)", out)
        self.assertIn("deployed", out)
        self.assertEqual(self.ui_state(), {})
        # The pinned artifact's files are back, and the published ones it lacks are pruned.
        self.assertEqual(self.deployed_text("mods/demo/main.js"), "// pinned\n")
        self.assertEqual(
            self.deployed_text("layouts/nested.json"), '{"id": "pinned"}\n'
        )
        self.assertFalse((self.deployed / "mods" / "demo" / "queue.js").exists())
        self.assertFalse((self.deployed / "mods" / "demo" / "mod.json").exists())

    def test_reset_refuses_a_harness_filter_for_a_ui_artifact(self):
        self.assert_ok(self.update("herdr-ui"))
        code, _, err = self.run_cli("reset", "herdr-ui", "--harness", "pi")
        self.assertEqual(code, 1)
        self.assertIn(
            "no --harness halves".replace("no --harness halves", "Herdr UI artifact"),
            err,
        )
        # Nothing was dropped on the way to the refusal.
        self.assertIn("herdr-ui", self.ui_state())

    def test_reset_keeps_the_old_root_for_a_running_session(self):
        self.assert_ok(self.update("herdr-ui"))
        roots = list((self.state / "roots").iterdir())
        self.assert_ok(self.run_cli("reset", "herdr-ui"))
        self.assertEqual(list((self.state / "roots").iterdir()), roots)

    def test_deploy_ui_without_any_publication_deploys_the_baseline(self):
        out, err = self.assert_ok(self.run_cli("deploy-ui", "herdr-ui"))
        self.assertIn("deployed 2 written", out)
        self.assertIn("baseline", out)
        self.assertEqual(self.deployed_text("mods/demo/main.js"), "// pinned\n")
        self.assertEqual(self.expr(), "")

    def test_deploy_ui_is_idempotent_and_writes_only_what_changed(self):
        self.assert_ok(self.run_cli("deploy-ui", "herdr-ui"))
        out, err = self.assert_ok(self.run_cli("deploy-ui", "herdr-ui"))
        self.assertIn("deployed 0 written, 2 unchanged", out)
        self.assertNotIn("no restart", out)

    def test_deploy_ui_honours_a_published_override(self):
        self.assert_ok(self.update("herdr-ui"))
        (self.deployed / "mods" / "demo" / "main.js").write_text(
            "// edited\n", encoding="utf-8"
        )
        self.assert_ok(self.run_cli("deploy-ui", "herdr-ui"))
        self.assertEqual(self.deployed_text("mods/demo/main.js"), "// main\n")

    def test_deploy_ui_dry_run_writes_nothing(self):
        out, err = self.assert_ok(self.run_cli("deploy-ui", "herdr-ui", "--dry-run"))
        self.assertIn("would write", out)
        self.assertIn("would write mods/demo/main.js", out)
        self.assertFalse(self.deployed.exists())
        self.assertFalse((self.state / "ui" / "herdr-ui.json").exists())

    def test_a_published_artifact_that_left_the_store_falls_back_to_the_baseline(self):
        self.assert_ok(self.update("herdr-ui"))
        shutil.rmtree(self.store / "out-ui-herdr-ui")
        out, err = self.assert_ok(self.run_cli("deploy-ui", "herdr-ui"))
        self.assertIn("gone from the store", err)
        self.assertIn("baseline", out)
        self.assertEqual(self.deployed_text("mods/demo/main.js"), "// pinned\n")

    def test_deploy_ui_ignores_a_corrupt_state(self):
        self.state.mkdir(parents=True)
        self.current.write_text("{not json", encoding="utf-8")
        out, err = self.assert_ok(self.run_cli("deploy-ui", "herdr-ui"))
        self.assertIn("deploying the baseline only", err)
        self.assertEqual(self.deployed_text("mods/demo/main.js"), "// pinned\n")

    def test_deploy_ui_refuses_a_target_it_cannot_place(self):
        # In the baseline, so there is an artifact, but no deployment directory is known.
        self.write_baseline(ui={"mystery-ui": str(self.store / "baseline-herdr-ui")})
        code, _, err = self.run_cli("deploy-ui", "mystery-ui")
        self.assertEqual(code, 1)
        self.assertIn("no deployment directory is known", err)
        # And AGENTS_UI_DIR says where it goes, which is how a test or a second window does it.
        env = dict(self.env)
        env["AGENTS_UI_DIR"] = str(self.temporary / "elsewhere")
        code, out, err = self.run_cli("deploy-ui", "mystery-ui", env=env)
        self.assertEqual(code, 0, err)
        self.assertTrue(
            (self.temporary / "elsewhere" / "mods" / "demo" / "main.js").is_file()
        )

    def test_deploy_ui_without_a_baseline_fails(self):
        env = dict(self.env)
        env.pop("AGENTS_BASELINE")
        code, _, err = self.run_cli("deploy-ui", "herdr-ui", env=env)
        self.assertEqual(code, 1)
        self.assertIn("AGENTS_BASELINE is not set", err)

    def test_deploy_ui_says_when_a_name_is_in_no_baseline(self):
        self.write_baseline(ui={})
        code, _, err = self.run_cli("deploy-ui", "herdr-ui")
        self.assertEqual(code, 1)
        self.assertIn("nothing to deploy", err)

    def test_status_lists_the_ui_artifact(self):
        self.assert_ok(self.update("herdr-ui"))
        out, err = self.assert_ok(self.run_cli("status"))
        self.assertIn("ui (1):", out)
        self.assertIn(f"herdr-ui: {self.store / 'out-ui-herdr-ui'}", out)
        self.assertIn("pinned 1111111", out)

    def test_status_shows_the_pinned_artifact_when_nothing_is_published(self):
        out, err = self.assert_ok(self.run_cli("status"))
        self.assertIn(f"herdr-ui: baseline {self.store / 'baseline-herdr-ui'}", out)

    def test_check_is_clean_after_an_update(self):
        self.assert_ok(self.update("herdr-ui"))
        out, err = self.assert_ok(self.run_cli("check"))
        self.assertEqual(out, "")
        self.assertEqual(err, "")

    def test_check_warns_about_a_ui_snapshot_that_left_the_store(self):
        self.assert_ok(self.update("herdr-ui"))
        shutil.rmtree(self.store / "out-ui-herdr-ui")
        out, _ = self.assert_ok(self.run_cli("check"))
        self.assertIn("the herdr-ui UI artifact is gone from the store", out)
        self.assertIn("agents update herdr-ui", out)

    def test_check_warns_when_the_baseline_moved(self):
        self.assert_ok(self.update("herdr-ui"))
        self.write_baseline(revision="2222222222222222222222222222222222222222")
        out, _ = self.assert_ok(self.run_cli("check"))
        self.assertIn("herdr-ui was published from 1111111", out)

    def test_resolve_includes_the_ui_paths(self):
        resolved = json.loads(self.assert_ok(self.run_cli("resolve"))[0])
        self.assertEqual(
            resolved["ui"], {"herdr-ui": str(self.store / "baseline-herdr-ui")}
        )
        # The keys that were there first keep their order and shape.
        self.assertEqual(list(resolved), ["plugins", "skills", "ui"])
        self.assert_ok(self.update("herdr-ui"))
        resolved = json.loads(self.assert_ok(self.run_cli("resolve"))[0])
        self.assertEqual(
            resolved["ui"], {"herdr-ui": str(self.store / "out-ui-herdr-ui")}
        )

    def test_an_app_that_is_neither_a_plugin_nor_a_ui_artifact_is_refused(self):
        directory = self.checkout / "apps" / "mystery"
        directory.mkdir(parents=True)
        (directory / "package.json").write_text(
            json.dumps({"name": "mystery", "version": "0.1.0"}), encoding="utf-8"
        )
        code, _, err = self.update("mystery")
        self.assertEqual(code, 1)
        self.assertIn("neither a claude nor a pi half", err)
        self.assertIn('"herdr": {"ui": true}', err)
        self.assertFalse(self.current.exists())

    def test_the_ui_metadata_must_say_ui(self):
        directory = self.checkout / "apps" / "mystery"
        directory.mkdir(parents=True)
        (directory / "package.json").write_text(
            json.dumps({"name": "mystery", "version": "0.1.0", "herdr": {}}),
            encoding="utf-8",
        )
        code, _, err = self.update("mystery")
        self.assertEqual(code, 1)
        self.assertIn("neither a claude nor a pi half", err)

    def test_a_harness_filter_is_refused_for_a_ui_artifact(self):
        code, _, err = self.update("herdr-ui", "--harness", "pi")
        self.assertEqual(code, 1)
        self.assertIn("no --harness halves", err)

    def test_the_ui_half_does_not_need_a_claude_or_pi_build(self):
        # No claude half in the plan, so the expression must not wire mkClaudePlugin at all.
        self.assert_ok(self.update("herdr-ui"))
        self.assertNotIn("mkClaude", self.expr())
        self.assertNotIn("claude-code", self.expr())

    def test_live_says_herdr_reloads_its_own_files(self):
        out, err = self.assert_ok(self.update("herdr-ui", "--live", "pi"))
        self.assertIn("no reload request; Herdr watches the deployed files", out)
        self.assertNotIn("live pi:", out)

    def test_a_ui_artifact_can_be_published_alongside_a_plugin(self):
        out, err = self.assert_ok(self.update("answer", "herdr-ui"))
        self.assertIn("answer pi", out)
        self.assertIn("herdr-ui ui", out)
        raw = self.read_state()
        self.assertIn("answer", raw["plugins"])
        self.assertIn("herdr-ui", raw["ui"])


class StatusCheckTest(Fixture):
    def test_status_reports_the_pinned_revision_and_snapshots(self):
        self.assert_ok(self.update("answer"))
        code, out, err = self.run_cli("status")
        self.assertEqual(code, 0, err)
        self.assertIn("baseline: 1111111", out)
        self.assertIn(f"answer: pi {self.store / 'out-answer-pi'}", out)
        self.assertIn("pinned 1111111", out)

    def test_status_without_state_or_baseline(self):
        env = dict(self.env)
        env.pop("AGENTS_BASELINE")
        code, out, err = self.run_cli("status", env=env)
        self.assertEqual(code, 0, err)
        self.assertIn("baseline: unknown", out)
        self.assertIn("plugins (0):", out)
        self.assertIn("none", out)

    def test_check_is_silent_and_zero_when_clean(self):
        self.assert_ok(self.update("answer"))
        code, out, err = self.run_cli("check")
        self.assertEqual(code, 0, err)
        self.assertEqual(out, "")
        self.assertEqual(err, "")

    def test_check_warns_when_the_baseline_moved(self):
        self.assert_ok(self.update("answer"))
        self.write_baseline(revision="2222222222222222222222222222222222222222")
        code, out, err = self.run_cli("check")
        self.assertEqual(code, 0, err)
        self.assertIn("answer was published from 1111111", out)
        self.assertIn("the pinned baseline is 2222222", out)
        self.assertIn("agents update answer", out)

    def test_a_moved_baseline_never_withholds_or_drops_snapshots(self):
        # The baseline file ships from the same flake generation as the CLI, so after a
        # switch its revision always differs from what current.json recorded. That is a
        # warning, not a reason to ignore the overrides or to fail a launch.
        self.assert_ok(self.update("answer"))
        self.assert_ok(self.update("demo", "--skill"))
        self.write_baseline(
            revision="2222222222222222222222222222222222222222",
            plugins={
                "docfix": {"pi": str(self.store / "baseline-docfix-pi"), "claude": None}
            },
            skills={},
        )
        code, out, err = self.run_cli("resolve")
        self.assertEqual(code, 0, err)
        self.assertEqual(err, "")
        resolved = json.loads(out)
        # Overrides still win, unchanged, for a plugin the new baseline dropped entirely.
        self.assertEqual(
            resolved["plugins"]["answer"],
            {
                "pi": str(self.store / "out-answer-pi"),
                "claude": str(self.store / "out-answer-claude"),
            },
        )
        self.assertEqual(
            resolved["skills"]["demo"], str(self.store / "snapshot" / "skills" / "demo")
        )
        self.assertIn("docfix", resolved["plugins"])

        code, out, err = self.run_cli("status")
        self.assertEqual(code, 0, err)
        self.assertIn("baseline: 2222222", out)
        self.assertIn("pinned 1111111", out)

        code, out, _ = self.run_cli("check")
        self.assertEqual(code, 0)
        self.assertIn("the pinned baseline is 2222222", out)

    def test_check_warns_when_a_snapshot_left_the_store(self):
        self.assert_ok(self.update("answer"))
        shutil.rmtree(self.store / "out-answer-pi")
        code, out, _ = self.run_cli("check")
        self.assertEqual(code, 0)
        self.assertIn("the pi snapshot for answer is gone from the store", out)

    def test_check_without_baseline_still_exits_zero(self):
        env = dict(self.env)
        env.pop("AGENTS_BASELINE")
        code, out, _ = self.run_cli("check", env=env)
        self.assertEqual(code, 0)
        self.assertIn("AGENTS_BASELINE is not set", out)

    def test_check_reports_a_corrupt_state(self):
        self.state.mkdir(parents=True)
        self.current.write_text("{not json", encoding="utf-8")
        code, out, _ = self.run_cli("check")
        self.assertEqual(code, 0)
        self.assertIn("is not JSON", out)

    def test_check_reports_a_failed_reload(self):
        self.assert_ok(self.update("answer"))
        sessions = self.state / "sessions"
        sessions.mkdir()
        request = sessions / "s1.request.json"
        (sessions / "s1.json").write_text(
            json.dumps(
                {
                    "pid": os.getpid(),
                    "harness": "pi",
                    "sessionId": "s1",
                    "status": "idle",
                    "requestPath": str(request),
                }
            ),
            encoding="utf-8",
        )
        (sessions / "s1.request.json.ack").write_text(
            json.dumps({"id": "x", "status": "failed", "message": "boom"}),
            encoding="utf-8",
        )
        code, out, _ = self.run_cli("check")
        self.assertEqual(code, 0)
        self.assertIn("session s1's last reload failed: boom", out)

    def test_check_ignores_a_dead_sessions_failed_reload(self):
        self.assert_ok(self.update("answer"))
        sessions = self.state / "sessions"
        sessions.mkdir()
        finished = subprocess.Popen(["true"])
        finished.wait()
        request = sessions / "s1.request.json"
        (sessions / "s1.json").write_text(
            json.dumps(
                {
                    "pid": finished.pid,
                    "harness": "pi",
                    "sessionId": "s1",
                    "status": "idle",
                    "requestPath": str(request),
                }
            ),
            encoding="utf-8",
        )
        (sessions / "s1.request.json.ack").write_text(
            json.dumps({"id": "x", "status": "failed", "message": "boom"}),
            encoding="utf-8",
        )
        code, out, err = self.run_cli("check")
        self.assertEqual(code, 0, err)
        self.assertEqual(out, "")


class ResolveCliTest(Fixture):
    def test_resolve_before_any_update_is_the_baseline(self):
        code, out, err = self.run_cli("resolve")
        self.assertEqual(code, 0, err)
        self.assertEqual(
            json.loads(out),
            {
                "plugins": {
                    "answer": {
                        "pi": str(self.store / "baseline-answer-pi"),
                        "claude": str(self.store / "baseline-answer-claude"),
                    },
                    "docfix": {
                        "pi": str(self.store / "baseline-docfix-pi"),
                        "claude": None,
                    },
                },
                "skills": {"demo": str(self.store / "baseline-skills" / "demo")},
                "ui": {"herdr-ui": str(self.store / "baseline-herdr-ui")},
            },
        )

    def test_resolve_returns_only_json_on_stdout(self):
        self.assert_ok(self.update("answer"))
        code, out, err = self.run_cli("resolve")
        self.assertEqual(code, 0, err)
        self.assertEqual(err, "")
        json.loads(out)
        self.assertEqual(len(out.strip().splitlines()), 1)

    def test_resolve_survives_a_corrupt_state(self):
        self.state.mkdir(parents=True)
        self.current.write_text("{not json", encoding="utf-8")
        code, out, err = self.run_cli("resolve")
        self.assertEqual(code, 0)
        self.assertIn("resolving the baseline only", err)
        self.assertEqual(
            json.loads(out)["plugins"]["answer"]["pi"],
            str(self.store / "baseline-answer-pi"),
        )

    def test_resolve_without_baseline_fails(self):
        env = dict(self.env)
        env.pop("AGENTS_BASELINE")
        code, _, err = self.run_cli("resolve", env=env)
        self.assertEqual(code, 1)
        self.assertIn("AGENTS_BASELINE is not set", err)


@unittest.skipUnless(shutil.which("git"), "git is required")
class LiveTest(Fixture):
    def write_session(self, name, payload):
        sessions = self.state / "sessions"
        sessions.mkdir(parents=True, exist_ok=True)
        path = sessions / f"{name}.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def session_payload(self, session_id, status="idle", pid=None):
        return {
            "pid": os.getpid() if pid is None else pid,
            "harness": "pi",
            "sessionId": session_id,
            "status": status,
            "requestPath": str(self.temporary / f"{session_id}.request.json"),
        }

    def test_live_pi_writes_a_request_and_only_claims_requested(self):
        self.assert_ok(self.update("answer"))
        self.write_session("s1", self.session_payload("s1"))
        code, out, err = self.update("answer", "--live", "pi")
        self.assertEqual(code, 0, err)
        self.assertIn("live pi: requested in s1 (idle); not confirmed", out)
        self.assertNotIn("applied", out)
        request = json.loads(
            (self.temporary / "s1.request.json").read_text(encoding="utf-8")
        )
        self.assertEqual(sorted(request), ["id", "requestedAt"])
        self.assertEqual(len(request["id"]), 32)
        self.assertRegex(request["requestedAt"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")

    def test_a_matching_ack_is_reported_as_history_and_a_new_request_goes_out(self):
        self.assert_ok(self.update("answer"))
        self.write_session("s1", self.session_payload("s1"))
        self.assert_ok(self.update("answer", "--live", "pi"))
        first = json.loads(
            (self.temporary / "s1.request.json").read_text(encoding="utf-8")
        )
        (self.temporary / "s1.request.json.ack").write_text(
            json.dumps({"id": first["id"], "status": "applied"}), encoding="utf-8"
        )
        # The ack answers the previous update. It is history, not this update's result, and a
        # request for the update that just happened must still be delivered.
        out, _ = self.assert_ok(self.update("answer", "--live", "pi"))
        self.assertIn("live pi: s1's previous request was applied", out)
        self.assertIn("live pi: requested in s1 (idle); not confirmed", out)
        self.assertNotIn("applied by s1", out)
        second = json.loads(
            (self.temporary / "s1.request.json").read_text(encoding="utf-8")
        )
        self.assertNotEqual(first["id"], second["id"])

    def test_a_failed_ack_is_reported_with_its_message_and_a_new_request_goes_out(self):
        self.assert_ok(self.update("answer"))
        self.write_session("s1", self.session_payload("s1"))
        self.assert_ok(self.update("answer", "--live", "pi"))
        first = json.loads(
            (self.temporary / "s1.request.json").read_text(encoding="utf-8")
        )
        (self.temporary / "s1.request.json.ack").write_text(
            json.dumps(
                {
                    "id": first["id"],
                    "status": "failed",
                    "message": "extension reload threw",
                }
            ),
            encoding="utf-8",
        )
        out, _ = self.assert_ok(self.update("answer", "--live", "pi"))
        self.assertIn(
            "live pi: s1's previous request failed: extension reload threw", out
        )
        self.assertIn("live pi: requested in s1 (idle); not confirmed", out)
        second = json.loads(
            (self.temporary / "s1.request.json").read_text(encoding="utf-8")
        )
        self.assertNotEqual(first["id"], second["id"])

    def test_a_malformed_ack_is_history_too(self):
        # The bridge removes a malformed request and acks with id null; nothing may report
        # that as this update's outcome.
        self.assert_ok(self.update("answer"))
        self.write_session("s1", self.session_payload("s1"))
        (self.temporary / "s1.request.json.ack").write_text(
            json.dumps(
                {"id": None, "status": "failed", "message": "Malformed reload request"}
            ),
            encoding="utf-8",
        )
        out, _ = self.assert_ok(self.update("answer", "--live", "pi"))
        self.assertIn(
            "live pi: s1's previous request failed: Malformed reload request", out
        )
        self.assertIn("live pi: requested in s1 (idle); not confirmed", out)

    def test_busy_sessions_are_queued(self):
        self.assert_ok(self.update("answer"))
        self.write_session("s1", self.session_payload("s1", status="busy"))
        code, out, _ = self.update("answer", "--live", "pi")
        self.assertEqual(code, 0)
        self.assertIn("live pi: queued in s1 (busy); not confirmed", out)

    def test_an_unanswered_request_is_not_replaced(self):
        self.assert_ok(self.update("answer"))
        self.write_session("s1", self.session_payload("s1"))
        request_path = self.temporary / "s1.request.json"
        request_path.write_text(
            json.dumps({"id": "pending", "requestedAt": "2020-01-01T00:00:00Z"}),
            encoding="utf-8",
        )
        code, out, _ = self.update("answer", "--live", "pi")
        self.assertEqual(code, 0)
        self.assertIn("live pi: s1 has an unanswered request; not queued again", out)
        self.assertEqual(
            json.loads(request_path.read_text(encoding="utf-8"))["id"], "pending"
        )

    def test_a_stale_request_is_replaced(self):
        self.assert_ok(self.update("answer"))
        self.write_session("s1", self.session_payload("s1"))
        request_path = self.temporary / "s1.request.json"
        request_path.write_text(
            json.dumps({"id": "old", "requestedAt": "2020-01-01T00:00:00Z"}),
            encoding="utf-8",
        )
        os.utime(request_path, (0, 0))
        code, out, _ = self.update("answer", "--live", "pi")
        self.assertEqual(code, 0)
        self.assertIn("live pi: requested in s1 (idle)", out)
        self.assertNotEqual(
            json.loads(request_path.read_text(encoding="utf-8"))["id"], "old"
        )

    def test_dead_pids_are_ignored(self):
        self.assert_ok(self.update("answer"))
        finished = subprocess.Popen(["true"])
        finished.wait()
        self.write_session("s1", self.session_payload("s1", pid=finished.pid))
        code, out, _ = self.update("answer", "--live", "pi")
        self.assertEqual(code, 0)
        self.assertIn("live pi: ignored 1 stale session file(s)", out)
        self.assertIn("live pi: no running pi session", out)
        self.assertFalse((self.temporary / "s1.request.json").exists())

    def test_no_sessions_reports_it_plainly(self):
        self.assert_ok(self.update("answer"))
        code, out, _ = self.update("answer", "--live", "pi")
        self.assertEqual(code, 0)
        self.assertIn("live pi: no running pi session", out)

    def test_claude_is_reported_unsupported(self):
        self.assert_ok(self.update("answer"))
        self.write_session("s1", self.session_payload("s1"))
        code, out, _ = self.update("answer", "--live", "all")
        self.assertEqual(code, 0)
        self.assertIn("live claude: unsupported; restart the session", out)
        self.assertIn("live pi: requested in s1", out)

    def test_status_lists_sessions(self):
        self.assert_ok(self.update("answer"))
        self.write_session("s1", self.session_payload("s1", status="busy"))
        finished = subprocess.Popen(["true"])
        finished.wait()
        self.write_session("s2", self.session_payload("s2", pid=finished.pid))
        code, out, _ = self.run_cli("status")
        self.assertEqual(code, 0)
        self.assertIn("sessions (2):", out)
        self.assertIn("pi s1 busy", out)
        self.assertIn("pi s2 idle (missing)", out)

    def test_status_reports_the_last_ack_as_history(self):
        self.assert_ok(self.update("answer"))
        self.write_session("s1", self.session_payload("s1"))
        (self.temporary / "s1.request.json.ack").write_text(
            json.dumps({"id": "old", "status": "applied"}), encoding="utf-8"
        )
        code, out, _ = self.run_cli("status")
        self.assertEqual(code, 0)
        self.assertIn("pi s1 idle last ack applied", out)


@unittest.skipUnless(shutil.which("git"), "git is required")
class ExecutableTest(Fixture):
    def test_the_script_runs_as_a_subprocess_end_to_end(self):
        environment = dict(self.env)
        result = subprocess.run(
            [sys.executable, str(CLI_PATH), "resolve"],
            capture_output=True,
            text=True,
            env=environment,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            json.loads(result.stdout)["plugins"]["answer"]["pi"],
            str(self.store / "baseline-answer-pi"),
        )

        for argv in (["update", "answer"], ["check"], ["status"]):
            result = subprocess.run(
                [sys.executable, str(CLI_PATH), *argv],
                capture_output=True,
                text=True,
                env=environment,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            json.loads(self.current.read_text(encoding="utf-8"))["plugins"]["answer"][
                "pi"
            ],
            str(self.store / "out-answer-pi"),
        )

        result = subprocess.run(
            [sys.executable, str(CLI_PATH), "reset", "answer"],
            capture_output=True,
            text=True,
            env=environment,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            json.loads(self.current.read_text(encoding="utf-8"))["plugins"], {}
        )

    def test_usage_errors_exit_two(self):
        result = subprocess.run(
            [sys.executable, str(CLI_PATH)], capture_output=True, text=True, check=False
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("COMMAND", result.stderr)


@unittest.skipUnless(
    os.environ.get("AGENTS_UPDATE_REAL_NIX") == "1",
    "set AGENTS_UPDATE_REAL_NIX=1 (with the wrapper's AGENTS_* variables) to evaluate the real expression",
)
class RealNixTest(unittest.TestCase):
    """The one thing a fake nix cannot show: that this expression really derives a Claude half.

    Evaluates (never builds) mkClaudePlugin against the checkout and the installed claude-code,
    so a wrong attribute path, a stale flake.lock or a wrapped claude-code shows up here.
    """

    def test_the_claude_half_derives_from_the_snapshot(self):
        context = cli.Context.from_env(dict(os.environ))
        temporary = Path(tempfile.mkdtemp(prefix="agents-real-nix-"))
        self.addCleanup(shutil.rmtree, temporary, ignore_errors=True)
        snapshot = cli.publish_snapshot(
            context.checkout, temporary / "agents-snapshot", context.environment
        )
        names = sorted(
            name
            for name in os.listdir(snapshot.root / "apps")
            if "claude" in (cli.plugin_halves(snapshot.root, name) or ())
        )
        self.assertTrue(names, "the checkout has no plugin with a claude half")
        expression = cli.build_expression(
            context, snapshot.root, [(names[0], "claude")], []
        )
        result = subprocess.run(
            ["nix", "eval", "--impure", "--raw", "--expr", f"({expression}).drvPath"],
            capture_output=True,
            text=True,
            check=False,
            env=context.environment,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(
            result.stdout.startswith(str(context.store) + "/"), result.stdout
        )
        self.assertTrue(result.stdout.endswith(".drv"), result.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
