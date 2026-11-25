#!/usr/bin/env python3
"""Deploy a Herdr UI artifact into the writable directory the app loads it from.

Herdr reads its UI from a writable config directory (`$XDG_CONFIG_HOME/herdr-app`), not from a
store path: the app writes editor metadata beside a mod, and its layout editor saves layouts.
So the artifact cannot be linked there, as a plugin's store path can; its files are deployed as
real files.

The design is one sentence: **a deploy rewrites only the files that differ, and prunes only the
files it wrote last time.** Herdr watches those files and reloads them itself, so an unchanged
switch must not touch anything (a content-identical rewrite would wake every watcher for
nothing), and a file this tool never wrote - Herdr's `shared.json`, the mods home-manager links,
anything the person added - must survive both a deploy and a prune.

Ownership lives beside the publication state, not in the config dir:
`$XDG_STATE_HOME/agents-updates/ui/<name>.json` records the source, the destination root and the
relative paths written. A record made for a different destination root is never used to prune in
this one, so pointing the deployer somewhere else cannot delete files there.

Order matters to a watcher: helpers before entry points (`main.js`, `mod.json`), so a mod is
never seen with an entry point that imports a helper the tree does not have yet, and every mod
before the layouts. Each file is replaced by an atomic rename from a scratch directory inside
the destination, so no reader sees a half-written file; a failure rolls back what this run
changed and leaves the ownership record alone.
"""

from __future__ import annotations

import contextlib
import json
import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

# The artifact's folders, and the only paths this tool may write or prune. Herdr's config dir
# also holds `shared.json`, `settings.json`, `keys.json`, `programs.json` and the mods
# home-manager links; none of those are ours. A path outside these two is an artifact bug: the
# artifact is Herdr's runtime UI and nothing else (apps/herdr-ui/src/lib/artifact.spec.ts).
MANAGED_TOPS = ("mods", "layouts")

# The files a mod is loaded through. Deployed after its helpers, so a watcher never sees an
# entry point whose imports are missing.
ENTRIES = ("main.js", "mod.json")

# Where a target's files belong, relative to XDG_CONFIG_HOME: Herdr's own config directory,
# which is also where home-manager links the mods it owns. `AGENTS_UI_DIR` overrides it.
UI_TARGETS = {"herdr-ui": "herdr-app"}

# The ownership records, under the state directory beside `current.json`.
RECORD_DIR = "ui"

# Scratch files, inside the destination so a rename stays on one filesystem. Dot-prefixed and
# outside the two managed tops, so it is neither deployed nor pruned.
SCRATCH = ".agents-deploy"

MODE = 0o644


class DeployError(Exception):
    """A deploy the tool refuses or cannot finish; the caller prints it and exits 1."""


@dataclass
class DeployResult:
    name: str
    source: Path
    destination: Path
    written: list = field(default_factory=list)
    pruned: list = field(default_factory=list)
    skipped: list = field(default_factory=list)
    unchanged: int = 0
    dry_run: bool = False

    @property
    def changed(self):
        return bool(self.written or self.pruned)


# --------------------------------------------------------------------------------------------
# Where a target goes


def config_home(env):
    home = env.get("HOME") or str(Path.home())
    return Path(env.get("XDG_CONFIG_HOME") or os.path.join(home, ".config"))


def destination(name, env):
    """The directory `name` is deployed into.

    Herdr's own config dir for the targets this package knows, so home-manager's `herdr-app`
    entries and this tool write the same tree; `AGENTS_UI_DIR` for anything else (a test, or a
    second window whose config lives elsewhere).
    """
    override = env.get("AGENTS_UI_DIR")
    if override:
        return Path(override)
    folder = UI_TARGETS.get(name)
    if folder is None:
        raise DeployError(
            f"no deployment directory is known for {name!r} "
            f"(known: {', '.join(sorted(UI_TARGETS))}); set AGENTS_UI_DIR to say where it goes"
        )
    return config_home(env) / folder


def record_path(state, name):
    return Path(state) / RECORD_DIR / f"{name}.json"


# --------------------------------------------------------------------------------------------
# Paths


def inside(root, path):
    root = Path(root)
    path = Path(path)
    return path == root or root in path.parents


def safe_relative(relative):
    """`relative` as a deployable path, or a refusal.

    A deployed path must stay under the destination and inside one of the artifact's two
    folders: a `..`, an absolute path or an unexpected top folder is either an escape attempt
    or an artifact that is not the runtime UI, and neither may be written into a config dir.
    """
    text = str(relative)
    if not text or "\0" in text or text.startswith("/") or os.path.isabs(text):
        raise DeployError(
            f"{text!r} is not a relative path inside the artifact's "
            f"{' and '.join(MANAGED_TOPS)}"
        )
    parts = text.split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise DeployError(f"{text!r} is not a plain relative path")
    if len(parts) < 2 or parts[0] not in MANAGED_TOPS:
        raise DeployError(
            f"{text!r} is outside {' and '.join(MANAGED_TOPS)}: the artifact holds Herdr's "
            "runtime UI and nothing else, so it is not deployed"
        )
    return text


def order_key(relative):
    """Helpers, then entry points, then layouts: the order a watcher should see them in."""
    parts = relative.split("/")
    if parts[0] == "mods":
        return (1 if parts[-1] in ENTRIES else 0, relative)
    return (2, relative)


def collect(source):
    """Every file of `source`, as ordered relative paths.

    A symlink is followed to the file it names, and refused when it resolves outside the
    artifact: a deployed copy that pointed back into the store or the checkout could change
    under the app later, and the app must be able to edit what it reads.
    """
    source = Path(source)
    real = Path(os.path.realpath(source))
    found = []

    def walk(directory):
        try:
            entries = sorted(os.scandir(directory), key=lambda entry: entry.name)
        except OSError as exc:
            raise DeployError(
                f"cannot read {directory}: {exc.strerror or exc}"
            ) from None
        for entry in entries:
            path = Path(entry.path)
            relative = path.relative_to(source).as_posix()
            if entry.is_symlink():
                resolved = Path(os.path.realpath(path))
                if not inside(real, resolved):
                    raise DeployError(
                        f"{path} is a symlink to {os.readlink(path)}, which resolves to "
                        f"{resolved}, outside {source}; point it at a file in the artifact"
                    )
                if not resolved.is_file():
                    raise DeployError(
                        f"{path} is a symlink to {resolved}, which is not a file"
                    )
                found.append(relative)
            elif entry.is_dir(follow_symlinks=False):
                walk(path)
            elif entry.is_file(follow_symlinks=False):
                found.append(relative)
            else:
                raise DeployError(f"{path} is neither a file nor a directory")

    walk(source)
    return sorted(found, key=order_key)


def same_content(source, target):
    """True when the deployed file already holds exactly what the artifact holds."""
    if target.is_symlink() or not target.is_file():
        return False
    try:
        if os.stat(source).st_size != target.stat().st_size:
            return False
        return Path(source).read_bytes() == target.read_bytes()
    except OSError:
        return False


def _symlinked_parent(root, relative):
    """A symlinked directory on the way to `relative`, or None.

    Refused when it leaves the root (writing through it would escape); returned when it stays
    inside, because then it is another owner's tree - home-manager's link, typically - and a
    file there is reported rather than written.
    """
    current = Path(root)
    for part in relative.split("/")[:-1]:
        current = current / part
        if current.is_symlink():
            resolved = Path(os.path.realpath(current))
            if not inside(root, resolved):
                raise DeployError(
                    f"{current} is a symlink to {os.readlink(current)}, outside {root}; "
                    "refusing to write through it"
                )
            return current
    return None


def _remove_empty(root, directory):
    """Drop the directories a prune emptied, never the artifact's two top folders."""
    stop = {Path(root), *(Path(root) / top for top in MANAGED_TOPS)}
    current = Path(directory)
    while current not in stop and inside(root, current):
        try:
            current.rmdir()
        except OSError:
            return  # not empty: someone else's files live here
        current = current.parent


# --------------------------------------------------------------------------------------------
# The ownership record


def load_record(path, console=None):
    """The record of what this tool wrote last time; an absent one claims nothing."""
    path = Path(path)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as exc:
        # Without a record nothing is pruned and nothing is treated as ours. Say so: the next
        # successful deploy overwrites it, and the files it described stop being prunable.
        if console is not None:
            console.warn(
                f"agents: the ownership record {path} is unreadable ({exc}); "
                "no deployed file will be pruned this run"
            )
        return {}
    if not isinstance(raw, dict):
        return {}
    files = raw.get("files")
    return {
        "source": raw.get("source") if isinstance(raw.get("source"), str) else "",
        "destination": raw.get("destination")
        if isinstance(raw.get("destination"), str)
        else "",
        "files": [value for value in files if isinstance(value, str)]
        if isinstance(files, list)
        else [],
    }


def save_record(path, name, source, destination, files):
    payload = {
        "name": name,
        "source": str(source),
        "destination": str(destination),
        "files": sorted(files),
    }
    write_json_atomic(path, payload)


def write_json_atomic(path, data):
    """Write `data` beside `path` and rename it over, so a reader never sees a partial file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(data, stream, indent=2, sort_keys=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(temporary)
        raise
    with contextlib.suppress(OSError):
        descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


# --------------------------------------------------------------------------------------------
# The deploy


@dataclass
class _Changes:
    """What this run changed, so a failure part-way can be undone."""

    created: list = field(default_factory=list)
    replaced: list = field(default_factory=list)  # (path, bytes it held before)
    pruned: list = field(default_factory=list)  # (path, bytes it held before)


def _previous_bytes(target):
    try:
        return (
            target.read_bytes()
            if target.is_file() and not target.is_symlink()
            else None
        )
    except OSError as exc:
        raise DeployError(f"cannot read {target}: {exc.strerror or exc}") from None


def _rollback(changes, console):
    """Undo this run's writes, so a failed deploy leaves the tree it found."""
    failures = []
    for target, previous in changes.pruned:
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(previous)
        except OSError as exc:
            failures.append(f"{target}: {exc.strerror or exc}")
    for target, previous in changes.replaced:
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(previous)
        except OSError as exc:
            failures.append(f"{target}: {exc.strerror or exc}")
    for target in changes.created:
        try:
            target.unlink()
        except FileNotFoundError:
            pass
        except OSError as exc:
            failures.append(f"{target}: {exc.strerror or exc}")
    if failures:
        console.warn(
            "agents: the deploy failed and could not be fully undone: "
            + "; ".join(failures)
        )


def _write(source, target, scratch, changes):
    previous = (
        _previous_bytes(target) if (target.exists() or target.is_symlink()) else None
    )
    if previous is None:
        changes.created.append(target)
    else:
        changes.replaced.append((target, previous))
    scratch.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=str(scratch), prefix="deploy-")
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(Path(source).read_bytes())
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, MODE)
        os.replace(temporary, target)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(temporary)
        raise


def deploy(name, source, target, state, console, dry_run=False):
    """Deploy `source` into `target`, changing only what differs, and record what is ours."""
    source = Path(os.path.realpath(source))
    if not source.is_dir():
        raise DeployError(f"the {name} artifact {source} is not a directory")
    try:
        files = [safe_relative(relative) for relative in collect(source)]
    except OSError as exc:
        raise DeployError(f"cannot read {source}: {exc.strerror or exc}") from None
    if not files:
        raise DeployError(
            f"{source} holds no {' or '.join(MANAGED_TOPS)} files: it is not a Herdr UI artifact"
        )

    target = Path(os.path.realpath(target))
    if target.exists() and not target.is_dir():
        raise DeployError(f"{target} is not a directory")

    record_file = record_path(state, name)
    record = load_record(record_file, console)
    previous = list(record.get("files") or [])
    if record.get("destination") and Path(record["destination"]) != target:
        # The record describes another tree: nothing in this one is ours to prune, and claiming
        # the old paths would let a later run in the old tree delete files it still needs.
        previous = []
    ours = set(previous)

    result = DeployResult(name=name, source=source, destination=target, dry_run=dry_run)
    wanted = set(files)
    changes = _Changes()
    scratch = target / SCRATCH
    try:
        for relative in files:
            path = target / relative
            blocker = _symlinked_parent(target, relative)
            if blocker is not None:
                result.skipped.append(
                    (relative, f"{blocker} is a symlink this tool does not manage")
                )
                continue
            if path.is_symlink() and relative not in ours:
                # The precedent agents-refresh sets for a directory it shares: an entry a
                # previous generation wrote is replaced, anything else is reported and left
                # alone. Another owner's link is not ours to overwrite.
                result.skipped.append(
                    (
                        relative,
                        f"it is a symlink this tool does not manage ({os.readlink(path)})",
                    )
                )
                continue
            if path.is_dir() and not path.is_symlink():
                raise DeployError(
                    f"{path} is a directory; the artifact deploys a file there"
                )
            if same_content(source / relative, path):
                result.unchanged += 1
                continue
            result.written.append(relative)
            if dry_run:
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            _write(source / relative, path, scratch, changes)

        _prune(target, previous, wanted, result, changes, dry_run)
    except BaseException:
        if not dry_run:
            _rollback(changes, console)
        raise
    finally:
        if not dry_run:
            with contextlib.suppress(OSError):
                scratch.rmdir()  # only when this run left it empty

    if not dry_run:
        left_alone = {relative for relative, _ in result.skipped}
        save_record(
            record_file, name, source, target, [r for r in files if r not in left_alone]
        )
    return result


def _prune(target, previous, wanted, result, changes, dry_run):
    """Remove the files this tool wrote before and the artifact no longer has."""
    doomed = sorted(
        (relative for relative in set(previous) - wanted),
        key=lambda relative: (relative.count("/"), relative),
        reverse=True,
    )
    for relative in doomed:
        try:
            safe_relative(relative)
        except DeployError:
            # A record naming something outside the artifact's folders (hand-edited, or from an
            # older layout) is never acted on.
            continue
        if _symlinked_parent(target, relative) is not None:
            result.skipped.append(
                (relative, "its directory is a symlink this tool does not manage")
            )
            continue
        path = target / relative
        if path.is_symlink():
            result.skipped.append(
                (
                    relative,
                    f"it is now a symlink this tool does not manage ({os.readlink(path)})",
                )
            )
            continue
        if not path.is_file():
            # Already gone, or replaced by a directory: nothing of ours is left to remove.
            continue
        result.pruned.append(relative)
        if dry_run:
            continue
        changes.pruned.append((path, _previous_bytes(path) or b""))
        try:
            path.unlink()
        except OSError as exc:
            raise DeployError(f"cannot remove {path}: {exc.strerror or exc}") from None
        _remove_empty(target, path.parent)
