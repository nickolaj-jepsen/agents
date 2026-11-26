#!/usr/bin/env bash
# The packaged `agents-updates` black box: bin/agents, bin/agents-refresh and the pi package, with a
# fake nix, a real (small) git checkout and the real flock(2) helper. Run by `checks.agents-updates`
# in the Nix sandbox; the per-command specs are `pnpm turbo run test --filter=@agents/updates`.
set -euo pipefail

package=${1:?usage: agents-updates-test.sh PACKAGE}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

fail() {
  echo "agents-updates-test: $*" >&2
  exit 1
}

export HOME="$work/home"
mkdir -p "$HOME"
export TMPDIR="$work/tmp"
mkdir -p "$TMPDIR"
export XDG_STATE_HOME="$work/state"
export PATH="$work/bin:$PATH"

store="$work/store"
mkdir -p "$store/nixpkgs-source" "$store/claude-code-2.0" "$work/bin"

# A sandbox has no /usr/bin/env: the fake names the bash this test runs under.
printf '#!%s\n' "$(command -v bash)" >"$work/bin/nix"
cat >>"$work/bin/nix" <<'FAKE'
# Stands in for `nix build`: reads the linkFarm entries out of --expr and builds the same shape.
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
if [ -n "${FAKE_NIX_FAIL:-}" ]; then
  echo "fake nix: the build failed" >&2
  exit 1
fi
if [ -n "${FAKE_NIX_SLEEP:-}" ]; then
  if [ -n "${FAKE_NIX_MARKER:-}" ]; then : >"$FAKE_NIX_MARKER"; fi
  sleep "$FAKE_NIX_SLEEP"
fi
store=${FAKE_NIX_STORE:?}
farm=$(mktemp -d "$store/farm.XXXXXX")
for entry in $(printf '%s\n' "$expr" | sed -n 's/.*name = "\(plugins\/[^"]*\)".*/\1/p'); do
  name=$(printf '%s' "${entry#plugins/}" | tr '/' '-')
  mkdir -p "$store/out-$name" "$(dirname "$farm/$entry")"
  ln -sfn "$store/out-$name" "$farm/$entry"
done
if printf '%s\n' "$expr" | grep -q 'name = "skills"'; then
  snap=$(printf '%s\n' "$expr" | sed -n 's/.*builtins.path { path = \([^;]*\);.*/\1/p' | head -n1)
  rm -rf "$store/snapshot"
  mkdir -p "$store/snapshot"
  if [ -n "$snap" ] && [ -d "$snap/skills" ]; then cp -r "$snap/skills" "$store/snapshot/skills"; fi
  ln -sfn "$store/snapshot" "$farm/skills"
fi
ln -sfn "$farm" "$out"
FAKE
chmod +x "$work/bin/nix"

checkout="$work/checkout"
mkdir -p "$checkout/apps/answer/src" "$checkout/apps/docfix/src" "$checkout/skills/demo"
printf '{"name":"answer","version":"0.1.0","pi":{},"claude":{}}\n' >"$checkout/apps/answer/package.json"
printf 'export {};\n' >"$checkout/apps/answer/src/index.ts"
printf '{"name":"docfix","version":"0.1.0","pi":{}}\n' >"$checkout/apps/docfix/package.json"
printf 'export {};\n' >"$checkout/apps/docfix/src/index.ts"
printf '# demo\n' >"$checkout/skills/demo/SKILL.md"
printf 'node_modules/\n' >"$checkout/.gitignore"
git -C "$checkout" init -q -b main
git -C "$checkout" add -A
git -C "$checkout" -c user.name=t -c user.email=t@example.com commit -qm init
revision=$(git -C "$checkout" rev-parse HEAD)

baseline="$work/baseline.json"
cat >"$baseline" <<JSON
{"revision":"$revision","plugins":{"answer":{"pi":"$store/baseline-answer-pi","claude":"$store/baseline-answer-claude"},"docfix":{"pi":"$store/baseline-docfix-pi","claude":null}},"skills":{"demo":"$store/baseline-skills/demo"}}
JSON

export AGENTS_BASELINE="$baseline"
export AGENTS_CHECKOUT="$checkout"
export AGENTS_NIXPKGS="$store/nixpkgs-source"
export AGENTS_CLAUDE="$store/claude-code-2.0"
export AGENTS_SYSTEM=x86_64-linux
export AGENTS_UPDATE_LOCK_TIMEOUT=5
export FAKE_NIX_STORE="$store"

agents="$package/bin/agents"
refresh="$package/bin/agents-refresh"
state="$XDG_STATE_HOME/agents-updates"
current="$state/current.json"

# The wrappers put their own runtimeInputs (including the real nix) first on PATH, by design. The
# fake build therefore runs the sources the package installs, with this test's PATH, which is the
# same code the wrapper execs; the wrapper itself is exercised for everything that builds nothing.
cli() { node "$package/share/agents-updates/src/bin.ts" "$@"; }

# -- the installed layout -----------------------------------------------------------------------
"$agents" --help >"$work/help.txt" || fail "bin/agents --help failed"
grep -q COMMAND "$work/help.txt" || fail "bin/agents does not print its usage"
test -x "$agents" || fail "bin/agents is not executable"
test -x "$refresh" || fail "bin/agents-refresh is not executable"
test -f "$package/share/agents-updates/pi/package.json" || fail "the pi package manifest is missing"
test -f "$package/share/agents-updates/pi/extensions/agents-update.ts" || fail "the bridge is missing"
test -f "$package/share/agents-updates/pi/extensions/core/protocol.ts" || fail "the bridge's core is missing"
test -e "$package/share/agents-updates/python" && fail "share/python should be gone"
grep -q 'exec /nix/store/.*/bin/node /nix/store/.*/src/bin.ts' "$agents" ||
  fail "bin/agents does not run the installed sources from the store"

# -- resolve, update, check, status, reset ------------------------------------------------------
resolved=$("$agents" resolve)
printf '%s' "$resolved" | grep -q "$store/baseline-answer-pi" || fail "resolve did not read the baseline"

cli update answer >"$work/update.out" 2>"$work/update.err" || {
  cat "$work/update.err" >&2
  fail "update answer failed"
}
grep -q "$store/out-answer-pi" "$current" || fail "the pi half was not published"
grep -q "$store/out-answer-claude" "$current" || fail "the claude half was not published"
root=$(find "$state/roots" -maxdepth 2 -name build -type l | head -n1)
test -n "$root" || fail "no generation root was kept"
readlink "$root" | grep -q "$store/farm" || fail "the root does not point at the built linkFarm"

if [ -n "$("$agents" check)" ]; then fail "check reported drift on a clean publication"; fi
status=$("$agents" status)
printf '%s' "$status" | grep -q "baseline: ${revision:0:7}" || fail "status did not report the pin"

cli update demo --skill >/dev/null || fail "update demo --skill failed"
grep -q "$store/snapshot/skills/demo" "$current" || fail "the skill was not published"
cli reset answer >/dev/null || fail "reset answer failed"
grep -q '"plugins": {}' "$current" || fail "reset did not drop the plugin entry"

if cli update nope >/dev/null 2>"$work/nope.err"; then fail "an unknown name should fail"; fi
grep -q 'not a plugin in the checkout' "$work/nope.err" || fail "the unknown-name message changed"

# -- the kernel lock ----------------------------------------------------------------------------
mkdir -p "$state"
mkfifo "$work/hold.pipe"
agents-flock "$state/lock" -1 0.05 <"$work/hold.pipe" >"$work/locked.txt" &
holder=$!
exec 9>"$work/hold.pipe"
for _ in $(seq 100); do [ -s "$work/locked.txt" ] && break; sleep 0.05; done
grep -q locked "$work/locked.txt" || fail "the lock holder never locked"

set +e
AGENTS_UPDATE_LOCK_TIMEOUT=0.2 cli update answer >/dev/null 2>"$work/lock.err"
status=$?
set -e
test "$status" -eq 1 || fail "an update behind a held lock should exit 1, not $status"
grep -q 'another agents update holds' "$work/lock.err" || fail "the lock timeout message changed"

# A negative timeout has already passed, as Python's deadline had: fail at once, not forever.
start=$(date +%s)
set +e
AGENTS_UPDATE_LOCK_TIMEOUT=-1 cli update answer >/dev/null 2>"$work/negative.err"
negative=$?
set -e
elapsed=$(($(date +%s) - start))
test "$negative" -eq 1 || fail "a negative lock timeout should exit 1, not $negative"
grep -q 'another agents update holds' "$work/negative.err" || fail "the negative timeout message changed"
test "$elapsed" -lt 5 || fail "a negative lock timeout waited instead of failing at once"

exec 9>&-
wait "$holder"
cli update answer >/dev/null || fail "an update after the lock was released failed"

# A holder killed mid-update must not wedge the next one either.
mkfifo "$work/hold2.pipe"
agents-flock "$state/lock" -1 0.05 <"$work/hold2.pipe" >"$work/locked2.txt" &
holder=$!
exec 9>"$work/hold2.pipe"
for _ in $(seq 100); do [ -s "$work/locked2.txt" ] && break; sleep 0.05; done
kill -9 "$holder"
exec 9>&-
wait "$holder" 2>/dev/null || true
cli update answer >/dev/null || fail "an update after a killed holder failed"

# A Ctrl+C during a build: the prior publication survives, the snapshot is cleaned up, and the
# process exits 130 with the message Python printed. The fake build says when it has started.
cp "$current" "$work/before-sigint.json"
# The node process itself is the background job, so the signal reaches the CLI and not a wrapper.
set +e
FAKE_NIX_SLEEP=2 FAKE_NIX_MARKER="$work/nix-started" \
  node "$package/share/agents-updates/src/bin.ts" update answer >"$work/sigint.out" 2>"$work/sigint.err" &
interrupted=$!
set -e
for _ in $(seq 100); do [ -f "$work/nix-started" ] && break; sleep 0.05; done
test -f "$work/nix-started" || fail "the build never started"
kill -INT "$interrupted"
set +e
wait "$interrupted"
sigint_status=$?
set -e
test "$sigint_status" -eq 130 || fail "an interrupted update should exit 130, not $sigint_status"
grep -q 'agents: interrupted' "$work/sigint.err" || fail "the interruption message changed"
cmp -s "$current" "$work/before-sigint.json" || fail "an interrupted update changed the publication"
left=$(find "$TMPDIR" -maxdepth 1 -name 'agents-update-*' | wc -l)
test "$left" -eq 0 || fail "an interrupted update left $left snapshot(s) behind"

# -- refresh ------------------------------------------------------------------------------------
export AGENTS_CLI="$agents"

pi_profile="$work/pi-profile"
mkdir -p "$pi_profile"
cat >"$pi_profile/settings.json" <<JSON
{"packages":["user-package","$store/baseline-answer-pi","core"],"piAgents":{"twinExtensions":["$store/baseline-answer-pi"],"maxWorkingAgents":6},"model":"keep-me"}
JSON
AGENTS_HARNESS=pi AGENTS_PROFILE="$pi_profile" "$refresh" 2>"$work/refresh.err" || {
  cat "$work/refresh.err" >&2
  fail "the pi refresh failed"
}
grep -q 'user-package' "$pi_profile/settings.json" || fail "the pi refresh dropped a user package"
grep -q "$store/out-answer-pi" "$pi_profile/settings.json" || fail "the pi refresh did not publish the plugin"
grep -q 'keep-me' "$pi_profile/settings.json" || fail "the pi refresh dropped an unrelated setting"
grep -q 'maxWorkingAgents' "$pi_profile/settings.json" || fail "the pi refresh dropped the twin settings"
test -f "$pi_profile/.agents-updates.json" || fail "the refresh wrote no manifest"

claude_profile="$work/claude-profile"
settings_dir="$work/claude-settings"
mkdir -p "$claude_profile"
printed=$(AGENTS_HARNESS=claude AGENTS_PROFILE="$claude_profile" AGENTS_CLAUDE_SETTINGS_DIR="$settings_dir" "$refresh" 2>"$work/refresh-claude.err") || {
  cat "$work/refresh-claude.err" >&2
  fail "the claude refresh failed"
}
test -f "$printed" || fail "the claude refresh did not print its settings file"
grep -q 'CLAUDE_CODE_PLUGIN_DIRS' "$printed" || fail "the claude settings carry no plugin dirs"
grep -q "$store/out-answer-claude" "$printed" || fail "the claude settings miss the published plugin"
test -L "$claude_profile/skills/demo" || fail "the claude refresh did not link the skill"
readlink "$claude_profile/skills/demo" | grep -q "$store/snapshot/skills/demo" || fail "the skill link is wrong"

echo "agents-updates-test: ok"
