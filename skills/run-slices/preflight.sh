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
store=$root/.agents/store
mkdir -p "$store" || fail "cannot create the project store: $store"
printf 'Ready: %s at %s (store: %s)\n' "$branch" "$actual" "$store"
