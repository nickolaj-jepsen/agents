#!/usr/bin/env -S bash -euo pipefail
# Lays the Claude Code mods' API types into their gitignored .claude-plugin/types/, for
# editor types and `tsc -p <plugin>/claude`. Only an interactive session lays them, so
# this runs one on a throwaway pty until it has.

cd "$(dirname "$0")/.."

mods=(plugins/*/.claude-plugin)
args=()
for m in "${mods[@]}"; do
    rm -rf "$m/types"
    args+=(--plugin-dir "$(realpath "$m/..")")
done

# The store copies in CLAUDE_CODE_PLUGIN_DIRS would otherwise load beside the folders
# under the same names. CLAUDE_CODE_NO_FLICKER: killed before its screen is healthy, a
# session whose fullscreen comes from settings counts a strike in ~/.claude.json, and two
# turn fullscreen off for every later session; one the env forces arms no such canary.
# WT_NO_AUTOCLOSE: run from a worktree, the killed session would otherwise close it.
export CLAUDE_CODE_PLUGIN_DIRS= CLAUDE_CODE_NO_FLICKER=1 WT_NO_AUTOCLOSE=1
if [ "$(uname)" = Darwin ]; then
    script -q /dev/null claude "${args[@]}" </dev/null >/dev/null 2>&1 &
else
    script -qec "claude ${args[*]@Q}" /dev/null </dev/null >/dev/null 2>&1 &
fi
pid=$!
trap 'kill $pid 2>/dev/null || true' EXIT

for _ in $(seq 60); do
    laid=0
    for m in "${mods[@]}"; do
        [ -f "$m/types/tsconfig.json" ] && [ -f "$m/types/claude-code/index.d.ts" ] && laid=$((laid + 1))
    done
    if [ "$laid" = "${#mods[@]}" ]; then
        sleep 1
        echo "Laid types for $laid mods; restart the editor's TypeScript server to pick them up"
        exit 0
    fi
    sleep 1
done

echo "Timed out waiting for Claude Code to lay the mod types" >&2
exit 1
