/**
 * A stand-in for `wt`, which ships with the system config these plugins are wired into, not with
 * this flake: CI has none, and a run must not reach the person's own worktrees. It does what the
 * plugin and the scenarios ask of `wt`, on real git worktrees so the session's branch shows, in
 * `wt`'s layout: `$WT_WORKTREE_ROOT/<repo>/<name>`.
 *
 *   new <name> [base]   open a worktree, creating its branch off `base` (default: HEAD); print its path
 *   cd --main | . | <name>   print the primary checkout, this checkout, or a worktree's path
 *   close <name|path>   remove the worktree's folder; the branch stays
 */
export const WT = `#!/bin/sh
set -eu
root=\${WT_WORKTREE_ROOT:?wt stand-in: WT_WORKTREE_ROOT is not set}
main() { git worktree list --porcelain | sed -n '1s/^worktree //p'; }
under() {
  case "$1" in
    /*) printf '%s\\n' "$1" ;;
    *) printf '%s/%s/%s\\n' "$root" "$(basename "$(main)")" "$1" ;;
  esac
}
case "\${1:-}" in
  new)
    dest=$(under "$2")
    if [ ! -d "$dest" ]; then
      mkdir -p "$(dirname "$dest")"
      if git show-ref --verify --quiet "refs/heads/$2"; then
        git -C "$(main)" worktree add --quiet "$dest" "$2"
      else
        git -C "$(main)" worktree add --quiet -b "$2" "$dest" "\${3:-HEAD}"
      fi
    fi
    (cd "$dest" && pwd -P)
    ;;
  cd)
    case "$2" in
      --main) main ;;
      .) git rev-parse --show-toplevel ;;
      *)
        dest=$(under "$2")
        [ -d "$dest" ] || { echo "wt: no worktree named $2" >&2; exit 1; }
        (cd "$dest" && pwd -P)
        ;;
    esac
    ;;
  close) git -C "$(main)" worktree remove --force "$(under "$2")" ;;
  *) echo "wt stand-in: \${1:-} is not supported" >&2; exit 2 ;;
esac
`;
