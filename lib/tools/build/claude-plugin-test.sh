#!/bin/sh
# One app's built mod (dist/), validated and tested against the flake's Claude (CLAUDE_BIN),
# which the dev shell exports. Run from the app's
# folder, after its `build`. HOME is a scratch folder, so `claude plugin test` never reads or writes
# the person's ~/.claude.
set -eu

: "${CLAUDE_BIN:?CLAUDE_BIN is required; run tests inside nix develop}"
claude_bin=$CLAUDE_BIN
home=$(mktemp -d)
trap 'rm -rf "$home"' EXIT
export HOME=$home

cd dist
"$claude_bin" plugin validate --strict .
# The catalogue mod has no tests of its own, and `plugin test` fails on none.
set -- *.test.ts
if [ -e "$1" ]; then "$claude_bin" plugin test .; fi
