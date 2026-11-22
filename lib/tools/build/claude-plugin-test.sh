#!/bin/sh
# One app's built mod (dist/), validated and tested against the claude-code the app installs (the
# version the lockfile pins, which is what the task's cache key stands for). Run from the app's
# folder, after its `build`. HOME is a scratch folder, so `claude plugin test` never reads or writes
# the person's ~/.claude.
set -eu

PATH=$PWD/node_modules/.bin:$PATH
home=$(mktemp -d)
trap 'rm -rf "$home"' EXIT
export HOME=$home

cd dist
claude plugin validate --strict .
# The catalogue mod has no tests of its own, and `plugin test` fails on none.
set -- *.test.ts
if [ -e "$1" ]; then claude plugin test .; fi
