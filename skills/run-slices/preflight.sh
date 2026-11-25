#!/bin/sh
set -eu

fail() {
  printf 'run-slices preflight: %s\n' "$*" >&2
  exit 1
}

[ "$#" -ge 3 ] || fail 'usage: sh preflight.sh WORKTREE BRANCH COMMIT [SKILL_FILE ...]'
worktree=$1
branch=$2
commit=$3
shift 3
cd "$worktree" || fail "cannot enter $worktree"
root=$(git rev-parse --show-toplevel) || fail 'not a Git worktree'
[ "$root" -ef . ] || fail "expected the worktree root, got $PWD (root: $root)"
actual_branch=$(git symbolic-ref --quiet --short HEAD) || fail 'detached HEAD'
[ "$actual_branch" = "$branch" ] || fail "expected branch $branch, found $actual_branch"
expected=$(git rev-parse --verify "${commit}^{commit}") || fail "cannot resolve commit $commit"
actual=$(git rev-parse --verify HEAD)
[ "$actual" = "$expected" ] || fail "expected commit $expected, found $actual"
status=$(git status --porcelain)
[ -z "$status" ] || fail "worktree is not clean:
$status"
for skill in "$@"; do
  [ -f "$skill" ] && [ -r "$skill" ] || fail "skill file is not readable: $skill"
done
# The worktree sees the repository's store through .agents/store, as the notes plugin links a
# checkout: the store its id names, else a folder in the main checkout. A plain folder here would
# go with the worktree when it is removed.
common=$(git rev-parse --path-format=absolute --git-common-dir) || fail 'cannot find the git directory'
id=$(head -n 1 "$common/agents-store-id" 2>/dev/null | tr -cd 'A-Za-z0-9._-')
case $id in .|..) id= ;; esac
data=${XDG_DATA_HOME:-}
case $data in /*) ;; *) data=$HOME/.local/share ;; esac
if [ -n "$id" ]; then
  store=$data/agents/store/$id
else
  main=$(git worktree list --porcelain | sed -n 's/^worktree //p' | head -n 1)
  [ -n "$main" ] || fail 'cannot find the main checkout'
  store=$main/.agents/store
fi
mkdir -p "$store" || fail "cannot create the project store: $store"
store=$(cd "$store" && pwd -P) || fail "cannot enter the project store: $store"
link=$root/.agents/store
if [ -e "$link" ] || [ -L "$link" ]; then
  [ "$(cd "$link" 2>/dev/null && pwd -P)" = "$store" ] ||
    fail "$link is not the project store ($store); move what is in it there and remove it"
else
  mkdir -p "$root/.agents" && ln -sn "$store" "$link" || fail "cannot link $link to $store"
fi
exclude=$common/info/exclude
if ! grep -qxF '/.agents/store' "$exclude" 2>/dev/null; then
  mkdir -p "$common/info" && printf '%s\n' '/.agents/store' >> "$exclude" ||
    fail "cannot write $exclude"
fi
printf 'Ready: %s at %s (store: %s)\n' "$branch" "$actual" "$store"
